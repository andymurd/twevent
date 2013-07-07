(function() {
"use strict";

var htmlEncode = function(value) {
    return $('<div>').text(value).html();
};

var get_count = function(d) {
    return d.value.count;
};

var get_screen_name = function(d) {
    return d.value.extra.screen_name;
};

var get_hashtag = function(d) {
    return d.value.extra.hashtag;
};

var get_url = function(d) {
    return d.value.extra.url;
};

var get_display_url = function(d) {
    return d.value.extra.display;
};

var socket = io.connect(window.location, {'sync disconnect on unload' : true});
socket.on('update', function (data) {
    // First update?
    if ($('#loading').is(':visible')) {
        $('#loading').hide();
    }

    // Always show the keywords
    $(document).trigger('keywords', [ data.keywords ]);

    // Has the server found any tweets?
    if (data.total_tweets) {
        // Show the graphs
        $('.no-data-available.row-fluid').addClass('hidden');
        $('.data-available.row-fluid').removeClass('hidden');

        // Update all the graphs
        $(document).trigger('top_hashtags', [ data.top_hashtags ]);
        $(document).trigger('top_mentions', [ data.top_mentions ]);
        $(document).trigger('top_tweeters', [ data.top_tweeters ]);
        $(document).trigger('top_links', [ data.top_urls ]);
        $(document).trigger('total_tweets', [ data.total_tweets ]);
        $(document).trigger('total_users', [ data.total_users ]);
    } else {
        // Hide the tweets
        $('.data-available.row-fluid').addClass('hidden');
        $('.no-data-available.row-fluid').removeClass('hidden');
    }
});
socket.on('clients', function (data) {
    console.log('Update client count');

    $('#client_count').text(data.count);
    $('#client_max').text(data.max);
    $('#client_max_timestamp').text(new Date(data.max_timestamp).toLocaleString());
});

$(document).on('keywords', function(emitter, keywords) {
    var html = 'Tweets with ';
    for(var i = 0; i < keywords.length; i += 1) {
        html += '<q>' + htmlEncode(keywords[i]) + '</q>';

        if (i === keywords.length - 2) {
            html += ' &amp; ';
        }
        if (i < keywords.length - 2) {
            html += ', ';
        }
    }
    $('#keywords').html(html);
});
 
$(document).on('total_users', function(emitter, total_users) {
    $('#total_users_count').text(total_users);
});
 
$(document).on('total_tweets', function(emitter, total_tweets) {
    $('#total_tweets_count').text(total_tweets.value.count);
    $('#total_tweets_start').text(new Date(total_tweets.value.extra.start).toLocaleString());
    $('#total_tweets_end').text(new Date(total_tweets.value.extra.end).toLocaleString());

    var secs = (Date.parse(total_tweets.value.extra.end) -
                Date.parse(total_tweets.value.extra.start)) / 1000;
    var tps = total_tweets.value.count / secs;
    var tps_unit;
    if (tps > 1.0) {
        tps_unit = 'second';
    } else if ((tps * 60.0) > 1.0) {
        tps_unit = 'minute';
        tps *= 60.0;
    } else if ((tps * 3600.0) > 1.0) {
        tps_unit = 'hour';
        tps *= 3600.0;
    } else {
        tps_unit = 'day';
        tps *= (24.0 * 3600.0);
    }

    $('#tps_count').text(tps.toFixed(3));
    $('#tps_unit').text(tps_unit);
});
 
$(document).on('top_tweeters', function(emitter, top_tweeters) {
    var xaxis = {
        getx: get_count
    };
    
    var yaxis = {
        gety: get_screen_name,
        url: function(d) {
            return 'http://twitter.com/' + d;
        },
        text: function(d) {
            return '@' + d;
        }
    };

    graph('#top_tweeters > div', top_tweeters, xaxis, yaxis);
});

$(document).on('top_mentions', function(emitter, top_mentions) {
    var xaxis = {
        getx: get_count
    };
    
    var yaxis = {
        gety: get_screen_name,
        url: function(d) {
            return 'http://twitter.com/' + d;
        },
        text: function(d) {
            return '@' + d;
        }
    };

    graph('#top_mentions > div', top_mentions, xaxis, yaxis);
});
 
$(document).on('top_hashtags', function(emitter, top_hashtags) {
    var xaxis = {
        getx: get_count
    };
    
    var yaxis = {
        gety: get_hashtag,
        url: function(d) {
            return 'http://twitter.com/search?q=' + encodeURI(d);
        },
        text: function(d) {
            return d;
        }
    };

    graph('#top_hashtags > div', top_hashtags, xaxis, yaxis);
});
 
$(document).on('top_links', function(emitter, top_urls) {
    var xaxis = {
        getx: get_count
    };
    
    var yaxis = {
        gety: get_url,
        url: get_url,
        text: function(d, a) {
            return get_display_url(top_urls[a]);
        }
    };

    graph('#top_links > div', top_urls, xaxis, yaxis);
});
 
var graph = function(element_id, data, xaxis, yaxis) {
    var element = $(element_id);

    // Work out the size of the graph
    var size = {
        width: element.width(),
        height: element.height(),
        margin: {
            top: 0,
            right: 20,
            bottom: 30,
            left: 130
        }
    };

    var width = size.width - size.margin.left - size.margin.right;
    var height = size.height - size.margin.top - size.margin.bottom;

    // Calculate the axes
    var x = d3.scale.linear()
        .domain([0, d3.max(data, xaxis.getx)])
        .rangeRound([0, width]);

    var y = d3.scale.ordinal()
        .domain(data.map(yaxis.gety))
        .rangeRoundBands([0, height], 0.1);

    var xAxis = d3.svg.axis()
        .scale(x)
        .ticks(5)
        .orient('bottom');

    var yAxis = d3.svg.axis()
        .scale(y)
        .ticks(data.length)
        .tickFormat(yaxis.text)
        .orient('left');

    var svg;

    // Has the graph been created before?
    if (element.children('svg').length === 0) {
        console.log('Create graph ' + element_id);
        svg = d3.select(element_id)
            .append('svg')
            .attr('width', width + size.margin.left + size.margin.right)
            .attr('height', height + size.margin.top + size.margin.bottom)
            .append('g')
            .attr('transform', 'translate(' + size.margin.left + ',' + size.margin.top + ')');
    
        svg.append('g')
            .attr('class', 'y axis');
        
        svg.append('g')
            .attr('class', 'x axis')
            .attr('transform', 'translate(0,' + height + ')');
    } else {
        console.log('Update graph ' + element_id);

        svg = d3.select(element_id).select('g');
    }
    
    var delay = function(d, i) { return i * 50; };
    var rect = svg.selectAll('rect').data(data, yaxis.gety);
    rect.attr('class', 'bar');

    // Bar Inserts
    rect.enter()
        .append('rect')
        .attr('class', 'bar insert');

    // Bar Deletes
    rect.exit()
        .remove();

    // Bar Updates
    rect.attr('x', 3)
        .attr('height', y.rangeBand())
        .transition()
        .delay(delay)
        .duration(750)
        .attr('width', function(d) { return x(xaxis.getx(d)); })
        .attr('y', function(d) { return y(yaxis.gety(d)); });

    var text = svg.selectAll('.notation').data(data, yaxis.gety);

    // Text Inserts
    text.enter().append('text')
        .attr('class', 'notation');

    // Text Deletes
    text.exit().remove();

    // Text Updates
    text.text(xaxis.getx)
        .attr('x', function(d) { return x(xaxis.getx(d)); })
        .attr('dx', function(d) {
             var len = this.getComputedTextLength();

             // Will the notation fit inside the bar?
             if (len > x(xaxis.getx(d))) {
                 return 8;
             } else {
                 return 0 - len;
             }
         })
        .attr('width', function(d) { return x(xaxis.getx(d)); })
        .attr('text-anchor', 'right')
        .attr('height', y.rangeBand())
        .transition()
        .delay(delay)
        .duration(750)
        .attr('y', function(d) { return y(yaxis.gety(d)) + y.rangeBand()/2; })
        .attr('dy', '0.4em');

    var xax = svg.select('.x.axis'); // change the x axis
    xax.call(xAxis);
    var yax = svg.select('.y.axis'); // change the y axis
    yax.call(yAxis)
       .selectAll('text')
       .on('click', function(d) {
           window.location = d;
       });
};
 
}());

