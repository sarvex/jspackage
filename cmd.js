// Generated by CoffeeScript 1.3.3
var compile, fs, options, optparse, output, parser, printUsage, switches;

compile = require('./jspackage').compile;

fs = require('fs');

optparse = require('optparse');

switches = [['-h', '--help', "shows this help section"], ['-b', '--bare', "compile without a top-level function wrapper"], ['-w', '--watch', "watch source files and recompile when any change"], ['-l', '--lib PATH', "add an additional search directory for source files"]];

parser = new optparse.OptionParser(switches);

printUsage = function() {
  parser.banner = "Usage: jspackage input_file output_file [options]";
  return console.log(parser.toString());
};

parser.on('help', function() {
  printUsage();
  return process.exit(1);
});

options = {};

parser.on(0, function(arg) {
  return options.mainfile = arg;
});

output = null;

parser.on(1, function(arg) {
  return output = arg;
});

parser.on("bare", function() {
  return options.bare = true;
});

parser.on("watch", function() {
  return options.watch = true;
});

parser.on("lib", function(name, value) {
  var _ref;
  return ((_ref = options.libs) != null ? _ref : options.libs = []).push(value);
});

parser.parse(process.argv.splice(2));

if (!options.mainfile || !output) {
  printUsage();
  process.exit(1);
}

compile(options, function(err, code) {
  var timestamp;
  if (options.watch) {
    timestamp = (new Date()).toLocaleTimeString();
    if (err) {
      return console.error("" + timestamp + "  - error: " + err);
    } else {
      console.info("" + timestamp + " - generated " + output);
      return fs.writeFile(output, code);
    }
  } else {
    if (err) {
      throw err;
    }
    return fs.writeFile(output, code);
  }
});
