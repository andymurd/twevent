Twevent
=======

A simple Twitter event dashboard using Node.js and MongoDB.

Warning
-------

This repository is a work-in-progress. Use it at your own risk!

Getting Started
---------------

1.  Clone [this repository](https://github.com/andymurd/twevent)

    git clone https://github.com/andymurd/twevent.git

2.  Copy etc/config.json.sample to etc/config.json and edit it to replace the "SECRET" tokens with details 
    of your Twitter API keys and MongoDB connection.
    
    cd twevent
    cp etc/config.json.sample etc/config.json
    vi etc/config.json
    
3.  Run it

    node app.js

Connect to your MongoDB instance via the console and you should see two collections:

*   *tweets* - The raw tweets pulled from the Twitter stream
*   *MapReduce* - The results of a periodic map/reduce process that runs against the raw tweets
