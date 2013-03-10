var exec = require('child_process').exec
  , fs = require('fs')
  , path = require('path')
  , assert = require('assert')
  , async = require('async')
  , temp = require('temp')
  , tests_dir = "./tests/"
  , tmpJsFile = "./.test_out.tmp.js"
  , msg = ""
  , passCount = 0
  , failCount = 0

fs.readdir(tests_dir, function(err, files){
  assert.ifError(err);
  async.map(files, doTest, function(){
    if (msg.length > 0) process.stdout.write(msg);
    process.stdout.write("\n" + passCount + " passed, " + failCount + " failed.\n");
    fs.unlink(tmpJsFile);
    if (failCount > 0) process.exit(1);
  });
});

function doTest(test_dir, testDone){
  var mainFile = path.join(tests_dir, test_dir, "test");
  var expectFile = path.join(tests_dir, test_dir, "expected.txt");
  var switchesFile = path.join(tests_dir, test_dir, "switches.txt");
  var execResult = null;
  var expectedOutput = null;
  async.parallel([execTest, readExpected], function(){
    if (execResult.compile) {
      if (execResult.run) {
        if (execResult.output === expectedOutput) {
          process.stdout.write('.');
          passCount += 1;
        } else {
          process.stdout.write('F');
          failCount += 1;
          msg += "\n\n" +
            "======== " + test_dir + " failed   =========\n" +
            "-------- Expected Output:   ---------\n" + expectedOutput + "\n" +
            "-------------------------------------\n" +
            "-------- Actual Output:     ---------\n" +execResult.output+"\n" +
            "-------------------------------------";
        }
      } else {
        process.stdout.write('E');
        failCount += 1;
        msg += "\n\n" +
          "======== " + test_dir + " crashed  =========\n" +
          "--------       stderr:      ---------\n" + execResult.msg + "\n" +
          "-------------------------------------";
      }
    } else {
      process.stdout.write('X');
      failCount += 1;
      msg += "\n\n" +
        "======== " + test_dir + " compile error ====\n" +
        "-------- stderr:            ---------\n" + execResult.msg + "\n" +
        "-------------------------------------";
    }
    testDone();
  });
  function execTest(cb) {
    fs.readFile(switchesFile, 'utf8', function(err, switches){
      switches = (switches || "").replace(/\n/g, " ");
      temp.open("", function(err, tmpJsFile){
        var cmdline = "lib/cmd.js " + switches + " " + mainFile + " " + tmpJsFile.path;
        exec(cmdline, function(err, stdout, stderr){
          if (stderr.length > 0) {
            execResult = {
              compile: false,
              msg: stderr
            };
            cb();
          }
          exec("node " + tmpJsFile.path, function(err, stdout, stderr){
            fs.close(tmpJsFile.fd, function(){
              return fs.unlink(tmpJsFile.path);
            });
            if (stderr.length > 0) {
              execResult = {
                compile: true,
                run: false,
                msg: stderr
              };
            } else {
              execResult = {
                compile: true,
                run: true,
                output: stdout
              };
            }
            cb();
          });
        });
      });
    });
  }
  function readExpected(cb){
    fs.readFile(expectFile, 'utf8', function(err, out){
      expectedOutput = out;
      cb();
    });
  }
}
