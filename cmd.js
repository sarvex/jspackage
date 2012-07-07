#!/usr/local/bin/node

var compile = require('./jspackage').compile,
    fs = require('fs'),
    optparse = require('optparse');

var switches = [
    ['-h', '--help', "shows this help section"],
    ['-b', '--bare', "compile without a top-level function wrapper"],
    ['-w', '--watch', "watch source files and recompile when any change"],
];

var parser = new optparse.OptionParser(switches);

var printUsage = function() {
    parser.banner = "Usage: jspackage input_file [output_file] [options]"
    console.log(parser.toString());
};

parser.on('help', function() {
    printUsage();
    process.exit(1);
});

var options = {};
parser.on(0, function(arg) {
    options.mainfile = arg;
});

var output;
parser.on(1, function(arg) {
    output = arg;
});

parser.on("bare", function() {
    options.bare = true;
});

parser.on("watch", function() {
    options.watch = true;
});

parser.parse(process.argv.splice(2));

if (!options.mainfile) {
    printUsage();
    process.exit(1);
}

if (output) {
    compile(options, function(err, code) {
        if (options.watch) {
            var timestamp = (new Date()).toLocaleTimeString()
            if (err) {
                console.error(timestamp + " - error: " + err);
            } else {
                console.info(timestamp + " - generated " + output);
                fs.writeFile(output, code);
            }
        } else {
            if (err) throw err;
            fs.writeFile(output, code);
        }
    });
}
