(function() {
"use strict";

/**
 * Module dependencies.
 */
var express  = require('express');
var nconf    = require('nconf');
var async    = require('async');

var keywords = [
    'awesome',
    'cool',
    'rad',
    'gnarly',
    'groovy'
];

// Load the configuration
nconf.argv().env().file({ 'file': __dirname + '/etc/config.json' });

// Local modules depend on the configuration
var routes  = require('./routes');
var twitter = require('./server/twitter')(nconf);
var db      = require('./server/mongodb')(nconf);
var models;

var feature_exec = function(name, fn) {
    if (nconf.get('features:' + name)) {
        fn();
    } else {
        // Do nothing
    }
};

// Connect to Twitter and our MongoDB
async.parallel(
    {
        db: db.connect,
        twitter: twitter.connect
    },
    function(err, results) {
        if (err) {
            throw err;
        } else {
            // Set up the MongoDB models
            models = db.models(db.schemas());

            if (nconf.get('features:twitter:stream')) {
                // Start listening on the Twitter sandbox stream
                twitter.stream(keywords, function(err, tweet) {
                    if (err) {
                        console.log('TWITTER STREAM ERROR: ' + err);
                        throw err;
                    }

                    if (nconf.get('features:mongodb:save_tweets')) {
                        // Save the tweet to the database
                        var data = new models.tweet(tweet);
                        data.save(function(err) {
                            if (err) {
                                console.log('MONGODB SAVE ERROR: ' + err);
                                throw err;
                            }
                        });
                    }
                });
            }

            // After a few seconds, start collating statistics
            setTimeout(function() {
                if (nconf.get('features:mongodb:mapreduce')) {
                    db.mapreduce(models, function(err, results) {
                        if (err) {
                            throw err;
                        }
                    });
                }
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
app.get('/', function(req, res) {
    // Find the data to display
    async.parallel({
        top_tweeters: function(callback) {
            db.find_top_tweeters(models, callback);
        },
        top_urls: function(callback) {
            db.find_top_urls(models, callback);
        },
        top_mentions: function(callback) {
            db.find_top_mentions(models, callback);
        },
        top_hashtags: function(callback) {
            db.find_top_hashtags(models, callback);
        },
        total_tweets: function(callback) {
            db.find_total_tweets(models, callback);
        },
        total_users: function(callback) {
            db.count_users(models, callback);
        }
    }, function(err, results) {
        if (err) {
            throw err;
        }

        // Display the data
        req.keywords     = keywords;
        req.total_users  = results.total_users;
        req.total_tweets = results.total_tweets;
        req.top_tweeters = results.top_tweeters;
        req.top_urls     = results.top_urls;
        req.top_mentions = results.top_mentions;
        req.top_hashtags = results.top_hashtags;

console.log('keywords     = ' + keywords);
console.log('total_users  = ' + results.total_users);
console.log('total_tweets = ' + results.total_tweets);
console.log('top_tweeters = ' + results.top_tweeters);
console.log('top_urls     = ' + results.top_urls);
console.log('top_mentions = ' + results.top_mentions);
console.log('top_hashtags = ' + results.top_hashtags);
        routes.index(req, res);
    });
});

app.listen(3000, function() {
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});

}());

