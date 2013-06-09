(function() {
"use strict";

/**
 * Module dependencies.
 */

var express  = require('express');
var nconf    = require('nconf');
var NTwitter = require('ntwitter');
var mongoose = require('mongoose');
var async    = require('async');
var routes   = require('./routes');

var db;
var twitter;

var keywords = [
    'awesome',
    'cool',
    'rad',
    'gnarly',
    'groovy'
];

// Load the configuration
nconf.argv().env().file({ 'file': __dirname + '/etc/config.json' });

/**
 * Connect to the database using the configuration loaded by nconf
 *
 * @param callback Called upon completion, taking the standard (err, result)
 *        parameters.
 */
var connect_db = function(callback) {
    // Create the MongoDB interface
    mongoose.connect(nconf.get('mongodb:connection'));
    db = mongoose.connection;
    db.on('error', function(err) {
        console.log('MONGODB CONNECTION ERROR: ' + err);
        callback(err);
    });
    db.once('open', function() {
        console.log('Database open');
        callback(null, db);
    });
};

/**
 * Build the MongoDB schemas
 *
 * @return A hash of schemas
 */
var db_schemas = function() {
    var Schema = mongoose.Schema;
    var tweet = new Schema(
        {
            id_str: {
                type: String,
                unique: true,
                index: true,
                required: true
            },
            created_at: {
                type: Date,
                index: true,
                required: true
            },
            text: {
                type: String
            }
        },
        {
            id: false,
            strict: false,
            capped: 1024 * 1024 * nconf.get('mongodb.cap.tweet')
        }
    );
    var mapreduce = new Schema(
        {
            type: {
                type: String,
                index: true,
                required: true
            },
            count: {
                type: Number,
                required: true
            }
        },
        {
            strict: true,
            capped: 1024 * 1024 * nconf.get('mongodb.cap.mapreduce')
        }
    );

    return {
        tweet: tweet,
        mapreduce: mapreduce
    };
};

/**
 * Transform the MongoDB schemas into Mongoose models
 *
 * @param schemas A hash of MongoDB schemas, as returned by db_schemas()
 * @return A hash of Mongoose models, one per input schema
 */
var db_models = function(schemas) {
    return {
        tweet: mongoose.model('Tweet', schemas.tweet),
        mapreduce: mongoose.model('MapReduce', schemas.mapreduce)
    };
};

/**
 * A function for MongoDB's mapreduce processing that aggregates various
 * statistics about the tweets in the database.
 */
var mapper = function() {
    //console.log('Mapping ' + this.id);

    // Count the tweets per user
    emit(this.user.screen_name, {
        type: 'user_tweet_count',
        count: 1
    });

    // Count the hashtags
    this.entities.hashtags.forEach(function(hashtag) {
        emit('#' + hashtag.text, {
            type: 'hashtag',
            count: 1
        });
    });

    // Count the URLs
    this.entities.urls.forEach(function(url) {
        emit(url.expanded_url, {
            type: 'url',
            count: 1
        });
    });

    // Count the mentions
    this.entities.user_mentions.forEach(function(mention) {
        emit(mention.screen_name, {
            type: 'mention',
            count: 1
        });
    });
};

/**
 * A function for MongoDB's mapreduce processing that aggregates various
 * statistics about the tweets in the database.
 *
 * @param key The key of the data being reduced
 * @param values An array of values to be reduced
 * @return The reduced values
 */
var reducer = function(key, values) {
    //console.log('Reducing ' + key);
    var retval = {
        type: values[0].type,
        count: 0
    };
    values.forEach(function(value) {
        retval.count += value.count;
    });
    return retval;
};

/**
 * Perform a mapreduce operation over the stored tweets
 *
 * @param models A hash of MongoDB models, as returned by db_models()
 * @param callback Called upon completion, taking the standard (err, result)
 *        parameters.
 */
var mapreduce = function(models, callback) {
    console.log('Map/Reduce started');

    models.tweet.mapReduce(
        {
            map: mapper,
            reduce: reducer,
            out: {
                replace: 'MapReduce'
            },
            verbose: true
        },
        function(err, model, stats) {
            console.log('Map/reduce complete');
            console.log(stats);
            callback(err, model);
        }
    );
};

/**
 * Connect to Twitter with the credentials configured via nconf
 *
 * @param callback Called upon completion, taking the standard (err, result)
 *        parameters.
 */
var connect_twitter = function(callback) {
    // Create the Twitter interface
    var credentials = {
        consumer_key: nconf.get('twitter:consumer_key'),
        consumer_secret: nconf.get('twitter:consumer_secret'),
        access_token_key: nconf.get('twitter:access_token_key'),
        access_token_secret: nconf.get('twitter:access_token_secret')
    };
    twitter = new NTwitter(credentials);

    // Can we connect?
    twitter.verifyCredentials(function (err, data) {
        if (err) {
            console.log('CREDENTIALS ERROR: ' + err);
        }
        callback(err, twitter);
    });
};

/**
 * Connect to Twitter's sandbox stream and track the supplied keywords
 *
 * @param keywords An array of keywords to track
 * @param twitter The handle of our Twitter connection
 * @param callback Called upon receipt of each tweet, taking the just the tweet
 *        parameters.
 */
var stream_twitter = function(keywords, twitter, callback) {
    twitter.stream(
        'statuses/filter',
        {
            track: keywords
        },
        function(stream) {
            stream.on('data', callback);
            stream.on('error', function(err) {
                console.log('STREAM ERROR: ' + err);
                throw err;
            });
        }
    );
};

async.parallel(
    {
        db: connect_db,
        twitter: connect_twitter
    },
    function(err, results) {
        if (err) {
            throw err;
        } else {
            var model = db_models(db_schemas());

            stream_twitter(keywords, results.twitter, function(tweet) {
                //console.log(tweet.text);
                var data = new model.tweet(tweet);
                data.save(function(err) {
                    if (err) {
                        console.log('MONGODB SAVE ERROR: ' + err);
                        throw err;
                    }
                });
            });

            setTimer(function() {
                mapreduce(model, function(err, results) {
                    if (err) {
                        throw err;
                    }
                );
            }, nconf.get('mapreduce:every'));
        }
    }
);

// Create the HTTP app
var app = module.exports = express.createServer();

// Configuration
app.configure(function(){
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    app.use(express.session({ secret: 'your secret here' }));
    app.use(app.router);
    app.use(express['static'](__dirname + '/public'));
});

app.configure('development', function() {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function() {
  app.use(express.errorHandler());
});

// Routes
app.get('/', routes.index);

app.listen(3000, function(){
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});

}());

