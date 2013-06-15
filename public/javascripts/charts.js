var data = [
    {
        screen_name: '@johnaldrinpola',
        count: 37
    }, {
        screen_name: '@asdfghJobeeel',
        count: 34
    }, {
        screen_name: '@fictionalrp',
        count: 33
    }, {
        screen_name: '@JGDJAIN',
        count: 30
    }, {
        screen_name: '@EraSoWhatEver',
        count: 20
    }, {
        screen_name: '@poorvagairola',
        count: 18
    }, {
        screen_name: '@renzcenon',
        count: 16
    }, {
        screen_name: '@IamMarkyG',
        count: 13
    }, {
        screen_name: '@ahmedkotb',
        count: 12
    }, {
        screen_name: '@jcklnt0616',
        count: 11
    }
];
var dimensions = {
    width: 400,
    height: 280,
    margin: {
        top: 20, 
        right: 20, 
        bottom: 30, 
        left: 130
    }
};

var graph = function(element_id, data, getx, gety, size) {
    var width = size.width - size.margin.left - size.margin.right;
    var height = size.height - size.margin.top - size.margin.bottom;

    var x = d3.scale.linear()
        .domain([0, d3.max(data, getx)])
        .rangeRound([0, width]);

    var y = d3.scale.ordinal()
        .rangeRoundBands([0, height], .1);

    var xAxis = d3.svg.axis()
        .scale(x)
        .orient('bottom');

    var yAxis = d3.svg.axis()
        .scale(y)
        .orient('left');

    var svg = d3.select(element_id)
        .append('svg')
        .attr('width', width + size.margin.left + size.margin.right)
        .attr('height', height + size.margin.top + size.margin.bottom)
        .append('g')
        .attr('transform', 'translate(' + size.margin.left + ',' + size.margin.top + ')');

    x.domain([0, d3.max(data, getx)]);
    y.domain(data.map(gety));

    svg.append('g')
        .attr('class', 'y axis')
        .call(yAxis);
    
    svg.append('g')
        .attr('class', 'x axis')
        .attr('transform', 'translate(0,' + height + ')')
        .call(xAxis);
    
    svg.selectAll('rect')
        .data(data)
        .enter().append('rect')
        .attr('class', 'bar')
        .attr('x', 3)
        .attr('width', function(d) { return x(getx(d)); })
        .attr('y', function(d) { return y(gety(d)); })
        .attr('height', y.rangeBand());
    
    svg.selectAll('.notation')
        .data(data)
        .enter().append('text')
        .text(getx)
        .attr('class', 'notation')
        .attr('x', function(d) { return x(getx(d)); })
        .attr('dx', '-0.5em')
        .attr('width', function(d) { return x(getx(d)); })
        .attr('y', function(d) { return y(gety(d)) + y.rangeBand()/2; })
        .attr('dy', '0.4em')
        .attr('text-anchor', 'middle')
        .attr('height', y.rangeBand());
};

var getx = function(d) {
    return d.count;
};

var gety = function(d) {
    return d.screen_name;
};

window.onload = function () {
    graph('#top_tweeters_chart', data, getx, gety, dimensions);
};
