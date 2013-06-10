(function() {
"use strict";

/**
 * Module dependencies.
 */
var mongoose = require('mongoose');

// The database handle
var db;

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
        });
        return retval;
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
                console.log('Database open');
                callback(null, db);
            });
        },

        /**
         * Build the MongoDB schemas
         *
         * @name schemas
         * @memberOf mongodb
         * @field
         * @public
         * @return A hash of schemas
         */
        schemas: function() {
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
        },

        /**
         * Transform the MongoDB schemas into Mongoose models
         *
         * @name models
         * @memberOf mongodb
         * @field
         * @public
         * @param schemas A hash of MongoDB schemas, as returned by schemas()
         * @return A hash of Mongoose models, one per input schema
         */
        models: function(schemas) {
            return {
                tweet: mongoose.model('Tweet', schemas.tweet),
                mapreduce: mongoose.model('MapReduce', schemas.mapreduce)
            };
        },

        /**
         * Perform a mapreduce operation over the stored tweets
         *
         * @name mapreduce
         * @memberOf mongodb
         * @field
         * @public
         * @param models A hash of MongoDB models, as returned by models()
         * @param callback Called upon completion, taking the standard (err, result)
         *        parameters.
         */
        mapreduce: function(models, callback) {
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
        }
    };
};

}());
