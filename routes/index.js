
/*
 * GET home page.
 */

exports.index = function(req, res) {
    res.render('index', {
        title: 'Twevent',
        keywords:     req.keywords,
        total_users:  req.total_users,
        total_tweets: req.total_tweets,
        top_urls:     req.top_urls,
        top_hashtags: req.top_hashtags,
        top_mentions: req.top_mentions,
        top_tweeters: req.top_tweeters
    });
};
