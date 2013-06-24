(function() {
"use strict";

/**
 * Module dependencies.
 */
var express  = require('express');
var socketio = require('socket.io');
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
var routes   = require('./routes');
var twitter  = require('./server/twitter')(nconf);
var db       = require('./server/mongodb')(nconf);
var models;
var clients  = {
    count: 0,
    max:   0,
    max_timestamp: new Date()
};

/**
 * Wrap the supplied functionality in a check to see if the feature has been enabled
 *
 * @param name The feature name, as found in the configuration file
 * @param fn The function to wrap. This must take one parameter - a callback with the usual (err, result)
 *        parameters.
 * @return A function that checks the feature and conditionally executes the functionality
 */
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
    routes.index(req, res);
});

var io = socketio.listen(app.listen(3000, function() {
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
}));

io.sockets.on('connection', function (socket) {
    console.log('New client connection');
    if (++clients.count > clients.max) {
       clients.max = clients.count;
       clients.max_timestamp = new Date();
    }
    io.sockets.emit('clients', clients);

    socket.on('disconnect', function () {
        console.log('Client disconnect');
        clients.count--;
        io.sockets.emit('clients', clients);
    });
});

var broadcast_update = function() {
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

        // Send the data to all clients
        results.keywords = keywords;
        io.sockets.emit('update', results);
    });
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
            // Buffer for unsaved tweets
            var tweets = [];

            // Start listening on the Twitter sandbox stream
            feature_exec('twitter:stream', function() {
                twitter.stream(keywords, function(err, tweet) {
                    if (err) {
                        console.log('TWITTER STREAM ERROR: ' + err);
                        throw err;
                    }
                    tweets.push(tweet);
                });
            })();

            // Save incoming tweets to the database
            feature_exec('mongodb:save_tweets', function() {
                setInterval(function() {
                    // Copy and clear the bufferr
                    var tweets_copy = tweets;
                    tweets = [];
                    var start = Date.now();

                    // Save the tweets to the database
                    async.each(
                        tweets_copy,
                        function(tweet, callback) {
                           db.save_tweet(tweet, callback);
                        }, function(err) {
                            if (err) {
                                console.log('MONGODB SAVE ERROR: ' + err);
                                throw err;
                            }
                            var end = Date.now();
                            console.log('Flushed ' + tweets_copy.length + ' to database after ' + (end - start) + ' milliseconds');
                        }
                    );
                }, nconf.get('flush_tweets:every'));
            })();

            // After a few seconds, start collating statistics
            feature_exec('mongodb:mapreduce', function() {
                var run_mapreduce = function() {
                    db.mapreduce(function(err, results) {
                        if (err) {
                            throw err;
                        }
                        broadcast_update();
                        setTimeout(run_mapreduce, nconf.get('mapreduce:every'));
                    });
                };
                console.log('Timer set for map/reduce');
                setTimeout(run_mapreduce, nconf.get('mapreduce:every'));
            })();
        }
    }
);

}());

