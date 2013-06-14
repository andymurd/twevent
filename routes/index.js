
/*
 * GET home page.
 */

exports.index = function(req, res) {
    res.render('index', {
        title: 'Twevent',
        keywords:     req.display_data.keywords,
        total_users:  req.display_data.total_users,
        total_tweets: req.display_data.total_tweets,
        top_urls:     req.display_data.top_urls,
        top_hashtags: req.display_data.top_hashtags,
        top_mentions: req.display_data.top_mentions,
        top_tweeters: req.display_data.top_tweeters
    });
};
