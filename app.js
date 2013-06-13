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
        return fn;
    } else {
        // Do nothing
        return function(callback) {
            console.log('WARNING: Feature ' + name + ' is disabled');
            if (callback) {
                callback();
            }
        };
    }
};

// Connect to Twitter and our MongoDB
async.parallel(
    {
        db: feature_exec('mongodb:connect', db.connect),
        twitter: feature_exec('twitter:connect', twitter.connect)
    },
    function(err, results) {
        if (err) {
            throw err;
        } else {
            feature_exec('twitter:stream', function() {
                // Start listening on the Twitter sandbox stream
                twitter.stream(keywords, function(err, tweet) {
                    if (err) {
                        console.log('TWITTER STREAM ERROR: ' + err);
                        throw err;
                    }

                    feature_exec('mongodb:save_tweets', function() {
                        // Save the tweet to the database
                        db.save_tweet(tweet, function(err) {
                            if (err) {
                                console.log('MONGODB SAVE ERROR: ' + err);
                                throw err;
                            }
                        });
                    })();
                });
            })();

            // After a few seconds, start collating statistics
            console.log('Timer set for map/reduce');
            setTimeout(feature_exec('mongodb:mapreduce', function() {
                db.mapreduce(function(err, results) {
                    if (err) {
                        throw err;
                    }
                });
            }), nconf.get('mapreduce:every'));
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
            db.find_top_tweeters(callback);
        },
        top_urls: function(callback) {
            db.find_top_urls(callback);
        },
        top_mentions: function(callback) {
            db.find_top_mentions(callback);
        },
        top_hashtags: function(callback) {
            db.find_top_hashtags(callback);
        },
        total_tweets: function(callback) {
            db.find_total_tweets(callback);
        },
        total_users: function(callback) {
            db.count_users(callback);
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

console.log('keywords     = ' + JSON.stringify(keywords));
console.log('total_users  = ' + JSON.stringify(results.total_users));
console.log('total_tweets = ' + JSON.stringify(results.total_tweets));
console.log('top_tweeters = ' + JSON.stringify(results.top_tweeters));
console.log('top_urls     = ' + JSON.stringify(results.top_urls));
console.log('top_mentions = ' + JSON.stringify(results.top_mentions));
console.log('top_hashtags = ' + JSON.stringify(results.top_hashtags));
        routes.index(req, res);
    });
});

app.listen(3000, function() {
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});

}());

