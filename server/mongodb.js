(function() {
"use strict";

/**
 * Module dependencies.
 */
var mongoose = require('mongoose');

// The database handle
var db;

// The data models
var models;

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
            start: this.created_at,
            end: this.created_at
        });

        // Count the tweets per user
        emit('tweets_per_user:' + this.user.screen_name, {
            screen_name: this.user.screen_name,
            type: 'user_tweet_count',
            count: 1
        });

        // Count the hashtags
        this.entities.hashtags.forEach(function(hashtag) {
            emit('#' + hashtag.text, {
                hashtag: '#' + hashtag.text,
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
                url: full_url,
                display: display_url,
                type: 'url',
                count: 1
            });
        });

        // Count the mentions
        this.entities.user_mentions.forEach(function(mention) {
            emit('mention:' + mention.screen_name, {
                screen_name: mention.screen_name,
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
            count: 0
        };
        values.forEach(function(value) {
            retval.count += value.count;

            if (value.screen_name) {
                retval.screen_name = value.screen_name;
            }
            if (value.hashtag) {
                retval.hashtag = value.hashtag;
            }
            if (value.url) {
                retval.url = value.url;
            }

            if (value.start && (retval.start === undefined || retval.start > value.start)) {
                retval.start = value.start;
            }
            if (value.end && (retval.end === undefined || retval.end < value.end)) {
                retval.end = value.end;
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
        var Schema = mongoose.Schema;
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
                    screen_name: String,
                    hashtag: String,
                    url: String,
                    start: Date,
                    end: Date
                }
            },
            {
                strict: false,
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
     * @name models
     * @memberOf mongodb
     * @field
     * @private
     * @param schemas A hash of MongoDB schemas, as returned by schemas()
     * @return A hash of Mongoose models, one per input schema
     */
    var models = function(schemas) {
        return {
            tweet: mongoose.model('Tweet', schemas.tweet),
            mapreduce: mongoose.model('mapreduces', schemas.mapreduce)
        };
    };

    return {
        /**
         * Connect to MongoDB with the credentials configured via nconf
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
            mongoose.connect(nconf.get('mongodb:connection'));
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
            console.log('Map/Reduce started');
        
            models.tweet.mapReduce(
                {
                    map: mapper,
                    reduce: reducer,
                    out: {
                        replace: 'mapreduces'
                    },
                    verbose: true
                },
                function(err, model, stats) {
                    console.log('Map/reduce complete');
                    console.log(stats);
                    callback(err, model);
                }
            );
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
