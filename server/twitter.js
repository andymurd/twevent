(function() {
"use strict";

/**
 * Module dependencies.
 */
var NTwitter = require('ntwitter');

// The Twitter handle
var twitter;

/**
 * @namespace Defines the connection to Twitter
 * @name twitter
 */
module.exports = function (nconf) {
    return {
        /**
         * Connect to Twitter with the credentials configured via nconf
         *
         * @name connect
         * @memberOf twitter
         * @field
         * @public
         * @param callback Called upon completion, taking the
         * standard (err, result) parameters.
         */
        connect: function(callback) {
            // Create the Twitter interface
            var credentials = {
                consumer_key: process.env.TWITTER_CONSUMER_KEY ||
                              nconf.get('twitter:consumer_key'),
                consumer_secret: process.env.TWITTER_CONSUMER_SECRET ||
                              nconf.get('twitter:consumer_secret'),
                access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY ||
                              nconf.get('twitter:access_token_key'),
                access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET ||
                              nconf.get('twitter:access_token_secret')
            };
            twitter = new NTwitter(credentials);

            // Can we connect?
            twitter.verifyCredentials(function (err, data) {
                if (err) {
                    console.log('CREDENTIALS ERROR: ' + err);
                }
                callback(err, twitter);
            });
        },

        /**
         * Connect to Twitter's sandbox stream and track the supplied keywords
         *
         * @name stream
         * @memberOf twitter
         * @field
         * @public
         * @param keywords An array of keywords to track
         * @param callback Called upon completion, taking the
         * standard (err, result) parameters.
         */
        stream: function(keywords, callback) {
            twitter.stream(
                'statuses/filter',
                {
                    track: keywords
                },
                function(stream) {
                    stream.on('data', function(tweet) {
                        callback(null, tweet);
                    });
                    stream.on('error', function(err) {
                        console.log('STREAM ERROR: ' + err);
                        callback(err);
                    });
                }
            );
        }
    };
};

}());

