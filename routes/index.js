
/*
 * GET home page.
 */

module.exports = {
    index: function(req, res) {
        res.render('index');
    },
    admin_form: function(req, res) {
        res.render('admin_form');
    }
};
