(function() {
"use strict";

/**
 * Module dependencies.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectID = mongoose.mongo.BSONPure.ObjectID;

// The database handle
var db;

// The data models
var models;

// The ObjectId of the last tweet that was successfully saved to the database
var last_tweet;

// The start of the range of records to incrementally mapreduce
var mapred_from;

// The end of the range of records to incrementally mapreduce
var mapred_to;

/**
 * @namespace Defines the connection to a MongoDB database
 * @name mongodb
 */
module.exports = function (nconf) {
    /**
     * A function for MongoDB's mapreduce processing that aggregates various
     * statistics about the tweets in the database.
     *
     * @name mapper
     * @memberOf mongodb
     * @field
     * @private
     */
    var mapper = function() {
        // Count the total tweets
        emit('total_tweets', {
            type: 'total',
            count: 1,
            extra: {
                start: this.created_at,
                end: this.created_at
            }
        });

        // Count the tweets per user
        emit('tweets_per_user:' + this.user.screen_name, {
            extra: {
                screen_name: this.user.screen_name
            },
            type: 'user_tweet_count',
            count: 1
        });

        // Count the hashtags
        this.entities.hashtags.forEach(function(hashtag) {
            emit('#' + hashtag.text, {
                extra: {
                    hashtag: '#' + hashtag.text
                },
                type: 'hashtag',
                count: 1
            });
        });

        // Count the URLs
        this.entities.urls.forEach(function(url) {
            var full_url;
            if (url.expanded_url) {
                full_url = url.expanded_url;
            } else {
                full_url = url.url;
            }

            var display_url;
            if (url.display_url) {
                display_url = url.display_url;
            } else {
                display_url = url.url;
            }

            emit(full_url, {
                extra: {
                    url: full_url,
                    display: display_url
                },
                type: 'url',
                count: 1
            });
        });

        // Count the mentions
        this.entities.user_mentions.forEach(function(mention) {
            emit('mention:' + mention.screen_name, {
                extra: {
                    screen_name: mention.screen_name
                },
                type: 'mention',
                count: 1
            });
        });
    };

    /**
     * A function for MongoDB's mapreduce processing that aggregates various
     * statistics about the tweets in the database.
     *
     * @name reducer
     * @memberOf mongodb
     * @field
     * @private
     * @param key The key of the data being reduced
     * @param values An array of values to be reduced
     * @return The reduced values
     */
    var reducer = function(key, values) {
        var retval = {
            type: values[0].type,
            extra: values[0].extra,
            count: 0
        };
        values.forEach(function(value) {
            retval.count += value.count;

            if (value.extra) {
                // Don't overwrite the start/end timestamps unless the new data expands the range
                if (value.extra.start && retval.extra.start && retval.extra.start < value.extra.start) {
                    value.extra.start = retval.extra.start;
                }
                if (value.extra.end && retval.extra.end && retval.extra.end > value.extra.end) {
                    value.extra.end = retval.extra.end;
                }

                // Overwrite ALL the extra data
                retval.extra = value.extra;
            }
        });
        return retval;
    };

    /**
     * Build the MongoDB schemas
     *
     * @name schemas
     * @memberOf mongodb
     * @field
     * @private
     * @return A hash of schemas
     */
    var schemas = function() {
        // The "tweet" schema stores a buffer of tweets for analysis.
        // This capped collection must be large enough to ensure that
        // there is sufficient space to store all the tweets recorded
        // between mapreduce runs
        var tweet = new Schema(
            {
                id: {
                    type: Number,
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

        // The "mapreduce" schema stores the results of mapreduce
        // runs.
        var mapreduce = new Schema(
            {
                value: {
                    type: {
                        type: String,
                        index: true,
                        required: true
                    },
                    count: {
                        type: Number,
                        required: true
                    },
                    extra: Object
                }
            },
            {
                strict: false,
                capped: 1024 * 1024 * nconf.get('mongodb.cap.mapreduce')
            }
        );
        mapreduce.index({
            'value.type': 1,
            'value.count': -1
        });

        // The "config" schema stores configuration information.
        var config = new Schema(
            {
                keywords: [
                    {
                        type: String,
                        lowercase: true,
                        trim: true,
                        matches: /[#@]?[a-z0-9_\-]+/
                    }
                ],
                features: Object
            },
            {
                strict: true,
                capped: 1024 * 1024 * nconf.get('mongodb.cap.config')
            }
        );

        // The "results" schema stores the results of previous configurations.
        var results = new Schema(
            {
                timestamp: {
                    type: Date,
                    required: true,
                    index: true
                },
                keywords: {
                    type: String,
                    required: true,
                    index: true
                },
                top_tweeters: {
                    type: [mapreduce],
                    required: true
                },
                top_mentions: {
                    type: [mapreduce],
                    required: true
                },
                top_hashtags: {
                    type: [mapreduce],
                    required: true
                },
                top_urls: {
                    type: [mapreduce],
                    required: true
                }
            },
            {
                strict: true,
                capped: 1024 * 1024 * nconf.get('mongodb.cap.results')
            }
        );

        return {
            tweet: tweet,
            mapreduce: mapreduce,
            config: config,
            results: results
        };
    };

    /**
     * Transform the MongoDB schemas into Mongoose models
     *
     * @name models
     * @memberOf mongodb
     * @field
     * @private
     * @param schemas A hash of MongoDB schemas, as returned by schemas()
     * @return A hash of Mongoose models, one per input schema
     */
    var models = function(schemas) {
        // Create the schema
        var create = function(name, schema) {
            // Check for errors when creating indexes
            schema.on('index', function (err) {
                if (err) {
                    console.error('INDEX CREATION ERROR on collection ' +
                                  name + ': ' + err);
                }
            });
            return mongoose.model(name, schema);
        };

        // Create the models
        return {
            tweet: create('tweets', schemas.tweet),
            mapreduce: create('mapreduces', schemas.mapreduce),
            config: create('config', schemas.config),
            results: create('results', schemas.results)
        };
    };

    /**
     * Perform a mapreduce operation over all of the stored tweets
     *
     * @name initial_mapreduce
     * @memberOf mongodb
     * @field
     * @private
     * @param to A timestamp of the last tweet to process
     * @param callback Called upon completion, taking the standard (err, result)
     *        parameters.
     */
    var initial_mapreduce = function(to, callback) {
        console.log('Initial Map/Reduce started');
    
        models.tweet.mapReduce(
            {
                map: mapper,
                reduce: reducer,
                out: {
                    replace: 'mapreduces'
                },
                query: {
                    _id: {
                        $lt: ObjectID.createFromTime(to.getTime()/1000)
                    }
                },
                verbose: true
            },
            function(err, model, stats) {
                console.log('Initial Map/reduce complete');
                console.log(stats);
                callback(err, model);
            }
        );
    };

    /**
     * Perform a mapreduce operation over any newly stored tweets
     *
     * @name incremental_mapreduce
     * @memberOf mongodb
     * @field
     * @private
     * @param from The timestamp of the last tweet processed in a previous mapreduce run
     * @param to A timestamp of the last tweet to process
     * @param callback Called upon completion, taking the standard (err, result)
     *        parameters.
     */
    var incremental_mapreduce = function(from, to, callback) {
        console.log('Incremental Map/Reduce started');
    
        models.tweet.mapReduce(
            {
                map: mapper,
                reduce: reducer,
                out: {
                    reduce: 'mapreduces'
                },
                query: {
                    _id: {
                        $gte: ObjectID.createFromTime(from.getTime()/1000),
                        $lt: ObjectID.createFromTime(to.getTime()/1000)
                    }
                },
                verbose: true
            },
            function(err, model, stats) {
                console.log('Incremental Map/reduce complete');
                console.log(stats);
                callback(err, model);
            }
        );
    };

    return {
        /**
         * Connect to MongoDB with the credentials configured via the
         * environmnt or nconf
         *
         * @name connect
         * @memberOf mongodb
         * @field
         * @public
         * @param callback Called upon completion, taking the
         * standard (err, result) parameters.
         */
        connect: function(callback) {
            // Create the MongoDB interface
            var connection = process.env.MONGOHQ_URL ||
                             process.env.MONGOLAB_URI ||
                             nconf.get('mongodb:connection');
            mongoose.connect(connection);
            db = mongoose.connection;
            db.on('error', function(err) {
                console.log('MONGODB CONNECTION ERROR: ' + err);
                callback(err);
            });
            db.once('open', function() {
                // Set up the MongoDB models
                models = models(schemas());

                console.log('Database open');
                callback(null, db);
            });
        },

        /**
         * Perform a mapreduce operation over the stored tweets
         *
         * @name mapreduce
         * @memberOf mongodb
         * @field
         * @public
         * @param callback Called upon completion, taking the standard (err, result)
         *        parameters.
         */
        mapreduce: function(callback) {
            var inner_callback = function(err, result) {
                if (!err) {
                    mapred_from = mapred_to;
                }
                callback(err, result);
            };

            // We are not attempting to mapreduce documents stored in the last
            // second because those writes may be continuing
            if (last_tweet) {
                mapred_to = last_tweet.getTimestamp();
            } else {
                mapred_to = new Date();
            }
            mapred_to.setSeconds(mapred_to.getSeconds()-1);
            console.log('Map reduce tweets >= ' + mapred_from);
            console.log('Map reduce tweets < ' + mapred_to);

            if (mapred_from) {
                incremental_mapreduce(mapred_from, mapred_to, inner_callback);
            } else {
                initial_mapreduce(mapred_to, inner_callback);
            }
        },

        /**
         * Save the suplied tweet to the database
         *
         * @param tweet The tweet to save
         * @param callback Called upon completion, taking the
         * standard (err, result) parameters.
         * @name save_tweet
         * @memberOf mongodb
         * @field
         * @public
         */
        save_tweet: function(tweet, callback) {
            var data = new models.tweet(tweet);
            data.save(function(err, result) {
                if (err && err.code === 11000) {
                    // Ignore duplicate key
                    err = undefined;
                    console.log('Duplicate key');
                }
else if (err) {
console.log('ERROR ' + err.code + ': ' + tweet);
}
                if (result) {
                    last_tweet = result._id;
                }
                callback(err, result);
            });
        },

        /**
         * Find the top tweeters (based on tweets per user).
         *
         * @param callback Called upon completion, taking the
         * standard (err, result) parameters.
         * @name find_top_tweeters
         * @memberOf mongodb
         * @field
         * @public
         */
        find_top_tweeters: function(callback) {
            models.mapreduce.find({
                'value.type': 'user_tweet_count'
            }).sort({'value.count': -1}).limit(10).exec(callback);
        },

        /**
         * Find the top hashtags (based on the number of tweets).
         *
         * @param callback Called upon completion, taking the
         * standard (err, result) parameters.
         * @name find_top_hashtags
         * @memberOf mongodb
         * @field
         * @public
         */
        find_top_hashtags: function(callback) {
            models.mapreduce.find({
                'value.type': 'hashtag'
            }).sort({'value.count': -1}).limit(10).exec(callback);
        },

        /**
         * Find the top URLs (based on the number of tweets).
         *
         * @param callback Called upon completion, taking the
         * standard (err, result) parameters.
         * @name find_top_urls
         * @memberOf mongodb
         * @field
         * @public
         */
        find_top_urls: function(callback) {
            models.mapreduce.find({
                'value.type': 'url'
            }).sort({'value.count': -1}).limit(10).exec(callback);
        },

        /**
         * Find the top mentioned users (based on the number of tweets).
         *
         * @param callback Called upon completion, taking the
         * standard (err, result) parameters.
         * @name find_top_mentions
         * @memberOf mongodb
         * @field
         * @public
         */
        find_top_mentions: function(callback) {
            models.mapreduce.find({
                'value.type': 'mention'
            }).sort({'value.count': -1}).limit(10).exec(callback);
        },

        /**
         * Find the total number of Tweets and the date range they cover
         *
         * @param callback Called upon completion, taking the
         * standard (err, result) parameters.
         * @name find_top_mentions
         * @memberOf mongodb
         * @field
         * @public
         */
        find_total_tweets: function(callback) {
            models.mapreduce.findOne({
                'value.type': 'total'
            }).exec(callback);
        },

        /**
         * Find the total number of users
         *
         * @param callback Called upon completion, taking the
         * standard (err, result) parameters.
         * @name count_users
         * @memberOf mongodb
         * @field
         * @public
         */
        count_users: function(callback) {
            models.mapreduce.count({
                'value.type': 'user_tweet_count'
            }).exec(callback);
        }
    };
};

}());
