Twevent
=======

A simple Twitter event dashboard using Node.js and MongoDB.

See it in action at [twevent.com](http://www.twevent.com)

Technologies Used
-----------------

1.  Node.js
2.  MongoDB + [Mongoose](http://mongoosejs.com)
3.  Websockets via [Socket.io](http://socket.io)
4.  D3
5.  Twitter's Streaming API

Warning
-------

This repository is a work-in-progress. Use it at your own risk!

Getting Started
---------------

1.  Clone [this repository](https://github.com/andymurd/twevent)

    `git clone https://github.com/andymurd/twevent.git`

Note that the repo has submodules, so you will need:

    `git submodule init`
    `git submodule update`

2.  Edit etc/config.json to replace the "SECRET" tokens with details 
    of your Twitter API keys and MongoDB connection.
    
3.  Run it

    `node app.js`

4.  Browse to http://localhost:3000 to see the results

Connect to your MongoDB instance via the console and you should see two collections:

*   *tweets* - The raw tweets pulled from the Twitter stream
*   *mapreduces* - The results of a periodic map/reduce process that runs against the raw tweets

Running on Heroku with MongoLabs or MongoHQ
-------------------------------------------

It is possible to run this software on a single Heroku dyno, see the Heroku documentation for details of how to run node.js applications on their platform.

The collections are capped and the map/reduce process is incremental so you can pair your Heroku dyno with a free sandbox database from [MongoHQ](http://mongohq.com) or [MongoLabs](http://mongolabs.com).

Your Heroku environment will need to be configured with the following environment variables:

*  *NODE_ENV* - Usually "production"
*  *MONGOHQ_URL* or *MONGOLAB_URI* - How to connect to your MongoDB instance
*  *TWITTER_CONSUMER_KEY* - Used to connect to the Twitter Streaming API
*  *TWITTER_CONSUMER_SECRET* - Used to connect to the Twitter Streaming API
*  *TWITTER_ACCESS_TOKEN_KEY* - Used to connect to the Twitter Streaming API
*  *TWITTER_ACCESS_TOKEN_SECRET* - Used to connect to the Twitter Streaming API

*Note:* Heroku's cedar stack does not support WebSockets, so you'll need to edit `etc/config.json` as follows:

```javascript
    "socketio": {
        "websockets": false
    },
```


