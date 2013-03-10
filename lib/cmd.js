var compile = require('./jspackage').compile
  , fs = require('fs')
  , path = require('path')
  , optparse = require('optparse')

var switches = [
  ['-h', '--help', "shows this help section and exit"],
  ['-v', '--version', "print the version number and exit"],
  ['-b', '--bare', "compile without a top-level function wrapper"],
  ['-w', '--watch', "watch source files and recompile when any change"],
  ['-l', '--lib PATH', "add an additional search directory for source files"]
];

var parser = new optparse.OptionParser(switches);
var mainfile = null;
var output = null;
var options = {};
parser.on('help', function(){
  printUsage();
  process.exit(1);
});
parser.on('version', function(){
  console.log(require('../package').version);
  process.exit(1);
});
parser.on(0, function(it){
  mainfile = it;
});
parser.on(1, function(it){
  output = it;
});
parser.on('bare', function(){
  options.bare = true;
});
parser.on('watch', function(){
  options.watch = true;
});
parser.on('lib', function(name, value){
  (options.libs || (options.libs = [])).push(value);
});
parser.parse(process.argv.splice(2));
if (!mainfile || !output) {
  printUsage();
  process.exit(1);
}
options.mainfile = removeExtension(mainfile);
compile(options, function(err, code){
  if (options.watch) {
    var timestamp = new Date().toLocaleTimeString();
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
function printUsage() {
  parser.banner = "Usage: jspackage input_file output_file [options]";
  console.log(parser.toString());
}
function removeExtension(filename) {
  var ext = path.extname(filename);
  return ext.length > 0 ? filename.substring(0, filename.length - ext.length) : filename;
}
