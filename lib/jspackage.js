var fs = require('fs')
  , path = require('path')
  , async = require('async')
  , watchFilesOnce = require('./watch').watchFilesOnce
  , cached_files = {}
  , watching = null
  , libs = null
  , root = null

exports.compile = compile;
exports.extensions = {
  '.coffee': {
    require: 'coffee-script',
    compile: function(code, options){
      return require('coffee-script').compile(code, {
        bare: options.bare
      });
    },
    depend_re: /^#depend "(.+)"( bare)?$/gm
  },
  '.js': {
    require: null,
    compile: function(code, options){
      if (options.bare) {
        return code;
      } else {
        return "(function(){\n" + code + "}).call(this);";
      }
    },
    depend_re: /^\/\/depend "(.+)"( bare)?;?$/gm
  },
  '.co': {
    require: 'coco',
    compile: function(code, options){
      return require('coco').compile(code, {
        bare: options.bare
      });
    },
    depend_re: /^#depend "(.+)"( bare)?$/gm
  },
  '.ls': {
    require: 'LiveScript',
    compile: function(code, options){
      return require('LiveScript').compile(code, {
        bare: options.bare
      });
    },
    depend_re: /^#depend "(.+)"( bare)?$/gm
  },
  '.iced': {
    require: 'iced-coffee-script',
    compile: function(code, options){
      return require('iced-coffee-script').compile(code, {
        bare: options.bare,
        runtime: 'inline',
      });
    },
    depend_re: /^#depend "(.+)"( bare)?$/gm
  }
};
function compile(options, cb){
  watching = options.watch;
  libs = (options.libs || []).map(function(lib) { return path.resolve(lib); });
  libs.unshift(".");

  root = null;
  var dep = {
    file: null,
    depend: options.mainfile,
    options: {
      bare: options.bare
    },
    cwd: process.cwd(),
    seen: []
  };
  collectDependencies(dep, function(collectErr){
    if (collectErr && root == null) {
      cb(collectErr);
      return;
    }
    resolveDependencyChain(root, function(err, dependencyChain){
      var dep, closer, output;
      if (watching) {
        closer = watchFilesOnce(depsToPaths(dependencyChain), function() {
          compile(options, cb);
        });
      }
      if (err) {
        cb(err);
      } else if (collectErr) {
        cb(collectErr);
      } else {
        output = renderDeps(dependencyChain);
        cb(null, output, closer);
      }
    });
  });
}
function parseFile(resolvedDep, cb){
  var file = {
    path: resolvedDep.path,
    compiled_js: null,
    mtime: null,
    deps: [],
    cwd: path.dirname(resolvedDep.path)
  };
  fs.stat(resolvedDep.path, function(err, stat){
    if (err) {
      cb(err);
      return;
    }
    file.mtime = +stat.mtime;
    fs.readFile(resolvedDep.path, 'utf8', function(err, source){
      var parser, timestamp, re, result;
      if (err) {
        cb(err);
        return;
      }
      if (source.charCodeAt(0) === 65279) {
        source = source.substring(1);
      }
      parser = exports.extensions[path.extname(resolvedDep.path)];
      try {
        file.compiled_js = parser.compile(source, resolvedDep.options);
      } catch (e$) {
        err = e$;
        cb(resolvedDep.path + "\n" + err, file);
        return;
      }
      if (watching) {
        timestamp = new Date().toLocaleTimeString();
        console.info(timestamp + " - compiled " + file.path);
      }
      re = parser.depend_re;
      re.lastIndex = 0;
      while (result = re.exec(source)) {
        file.deps.push({
          file: file,
          depend: result[1],
          options: {
            bare: result[2] != null
          },
          cwd: file.cwd,
          seen: resolvedDep.seen.concat(file.path)
        });
      }
      cb(null, file);
    });
  });
}
function resolveDepend(dep, doneResolvingDepend){
  var tryExts = Object.keys(exports.extensions);
  var libIndex = 0;
  tryNextLib();
  function tryNextLib() {
    var tryLib = libs[libIndex++];
    if (tryLib == null) {
      var source = dep.file ? dep.file.path : '(cli)';
      doneResolvingDepend(new Error(source +
            ": unable to resolve dependency: " + dep.depend));
      return;
    }
    async.map(tryExts, resolveWithExt, function(err, results){
      async.filter(results, function(item, cb){
        return cb(item != null);
      }, function(results){
        if (results.length === 1) {
          doneResolvingDepend(null, {
            path: results[0],
            options: dep.options,
            seen: dep.seen
          });
        } else if (results.length === 0) {
          tryNextLib();
        } else if (results.length > 1) {
          var source = dep.file ? dep.file.path : "(cli)";
          doneResolvingDepend(new Error(source + ": ambiguous dependency: " + dep.depend));
        }
      });
    });
    function resolveWithExt(ext, cb){
      var resolved_path = path.resolve(dep.cwd, tryLib, dep.depend + ext);
      fs.realpath(resolved_path, function(err, real_path){
        if (err) {
          cb(null, null);
          return;
        }
        fs.stat(real_path, function(err, stat){
          if (err || stat.isDirectory()) {
            cb(null, null);
          } else {
            cb(null, real_path);
          }
        });
      });
    }
  }
}
function resolveDependencyChain(root, doneResolvingDependencyChain){
  var files = [];
  var seen = {};
  processNode(root, function(err){
    doneResolvingDependencyChain(err, files);
  });
  function processNode(node, doneProcessingNode){
    async.map(node.deps, resolveDepend, function(err, resolved_deps){
      var i$, len$;
      if (err) {
        doneProcessingNode(err);
        return;
      }
      var funcs = [];
      for (i$ = 0, len$ = resolved_deps.length; i$ < len$; ++i$) {
        var dep = resolved_deps[i$];
        var file = cached_files[dep.path];
        if (seen[file.path] != null) {
          continue;
        }
        seen[file.path] = true;
        funcs.push(async.apply(processNode, file));
      }
      async.parallel(funcs, function(err, results){
        files.push(node);
        if (err) {
          doneProcessingNode(err);
          return;
        }
        doneProcessingNode(null);
      });
    });
  }
}
function collectDependencies(dep, doneCollectingDependencies){
  resolveDepend(dep, function(err, resolvedDep){
    var depChain, parseAndHandleErr, callNext, cached_file;
    if (err) {
      doneCollectingDependencies(err);
      return;
    }
    if (dep.seen.indexOf(resolvedDep.path) >= 0) {
      depChain = dep.seen.concat(resolvedDep.path).join(" depends on\n");
      doneCollectingDependencies(new Error("circular dependency:\n" + depChain));
      return;
    }
    parseAndHandleErr = function(cb){
      parseFile(resolvedDep, function(err, file){
        if (file) {
          cached_files[file.path] = file;
          if (root == null) root = file;
        }
        if (err) {
          doneCollectingDependencies(err);
        } else {
          cb(file);
        }
      });
    };
    callNext = function(file){
      async.map(file.deps, collectDependencies, doneCollectingDependencies);
    };
    if ((cached_file = cached_files[resolvedDep.path]) != null) {
      fs.stat(resolvedDep.path, function(err, stat){
        if (cached_file.mtime === +stat.mtime) {
          if (root == null) root = cached_file;
          callNext(cached_file);
        } else {
          parseAndHandleErr(callNext);
        }
      });
    } else {
      parseAndHandleErr(callNext);
    }
  });
}
function depsToPaths(deps) {
  return deps.map(function(dep) { return dep.path; });
}
function renderDeps(deps) {
  return deps.map(function(dep) { return dep.compiled_js; }).join("\n");
}
