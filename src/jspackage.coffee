fs = require('fs')
path = require('path')
async = require('async')


cached_files = {}
root = null
options = null

parseFile = (full_path, cb) ->
  file =
    path: full_path
    compiled_js: null
    mtime: null
    deps: []
  fs.stat full_path, (err, stat) ->
    if err
      cb err
      return
    file.mtime = +stat.mtime
    fs.readFile full_path, 'utf8', (err, source) ->
      if err
        cb err
        return
      parser = extensions[path.extname(full_path)]
      try
        file.compiled_js = parser.compile(source)
      catch err
        cb "#{full_path}\n#{err}", file
        return
      if options.watch
        timestamp = (new Date()).toLocaleTimeString()
        console.info "#{timestamp} - compiled #{file.path}"
      # get the list of dependencies
      re = parser.import_re
      re.lastIndex = 0
      while result = re.exec(source)
        import_string = result[1].slice(1, -1)
        file.deps.push import_string
      cb null, file


resolveImport = (cwd, import_string, doneResolvingImport) ->
  # try each of the supported extensions
  try_exts = [""].concat(Object.keys(extensions))
  # try each of the libs, but stop upon first success
  lib_index = 0
  tryNextLib = ->
    if (try_lib = libs[lib_index++])?
      resolveWithExt = (ext, cb) ->
        resolved_path = path.resolve(cwd, try_lib, import_string + ext)
        fs.realpath resolved_path, (err, real_path) ->
          if err
            cb null, null
            return
          fs.stat real_path, (err, stat) ->
            if err or stat.isDirectory()
              cb null, null
            else
              cb null, real_path
      async.map try_exts, resolveWithExt, (err, results) ->
        async.filter results, ((item, cb) -> cb(item?)), (results) ->
          if results.length is 1
            doneResolvingImport null, results[0]
          else if results.length is 0
            tryNextLib()
          else if results.length > 1
            doneResolvingImport("ambiguous import: #{import_string}")
          return
    else
      doneResolvingImport("unable to resolve import: #{import_string}")
  tryNextLib()
  
resolveDependencyChain = (root, doneResolvingDependencyChain) ->
  deps = []
  seen = {}
  processNode = (node, doneProcessingNode) ->
    resolveFromDep = (dep, cb) -> resolveImport(path.dirname(node.path), dep, cb)
    async.map node.deps, resolveFromDep, (err, resolved_deps) ->
      if err
        doneResolvingDependencyChain err
        return
      funcs = []
      for dep_path in resolved_deps
        dep = cached_files[dep_path]
        if seen[dep.path]?
          continue
        seen[dep.path] = true
        funcs.push async.apply(processNode, dep)
      async.parallel funcs, (err, results) ->
        if err
          doneResolvingDependencyChain err
          return
        deps.push node
        doneProcessingNode()
  processNode root, ->
    doneResolvingDependencyChain null, deps

collectDependencies = (cwd, import_string, doneCollectingDependencies) ->
  resolveImport cwd, import_string, (err, canonical_path) ->
    if err
      doneCollectingDependencies(err)
      return

    parseAndHandleErr = (cb) ->
      parseFile canonical_path, (err, file) ->
        if file
          cached_files[file.path] = file
          root ?= file

        if err
          doneCollectingDependencies(err)
        else
          cb(file)

        return

    callNext = (file) ->
      collectFromFile = (dep, cb) ->
        collectDependencies(path.dirname(file.path), dep, cb)
      async.map file.deps, collectFromFile, doneCollectingDependencies

    if (cached_file = cached_files[canonical_path])?
      fs.stat canonical_path, (err, stat) ->
        if cached_file.mtime is +stat.mtime
          root ?= cached_file
          callNext cached_file
        else
          parseAndHandleErr callNext
    else
      parseAndHandleErr callNext


# emulates fs.watch
watchFileFallback = (filename, options, cb) ->
  options.interval = 701
  fs.watchFile filename, options, (curr, prev) ->
    if curr.mtime isnt prev.mtime
      cb "change", filename
  return {close: -> fs.unwatchFile(filename)}

watchFile = fs.watch or watchFileFallback

watchFiles = (files, cb) ->
  watchers = []
  doCallback = (event) ->
    if event is "change"
      watcher.close() for watcher in watchers
      cb()
  for file in files
    try
      watcher = fs.watch(file, doCallback)
    catch err
      watcher = watchFileFallback(file, doCallback)
    watchers.push watcher

libs = null
compile = (_options, cb) ->
  options = _options

  libs = options.libs ? []
  libs = (path.resolve(lib) for lib in libs)
  libs.unshift "."

  root = null
  collectDependencies process.cwd(), options.mainfile, (collect_err) ->
    if collect_err and not root?
      cb(collect_err)
      return
    resolveDependencyChain root, (err, dependency_chain) ->
      if _options.watch
        watchFiles (dep.path for dep in dependency_chain), ->
          compile _options, cb
      if err
        cb(err)
      else if collect_err
        cb(collect_err)
      else
        output = (dep.compiled_js for dep in dependency_chain).join("\n")
        cb(null, output)
      return

extensions =
  '.coffee':
    compile: (code) -> require('coffee-script').compile code, bare: options.bare
    import_re: /^#import (".+")$/gm

  '.js':
    compile: (code) ->
      if options.bare
        code
      else
        "(function(){\n#{code}}).call(this);"
    import_re: /^\/\/import (".+");?$/gm

  '.co':
    compile: (code) -> require('coco').compile code, bare: options.bare
    import_re: /^#import (".+")$/gm

  '.ls':
    compile: (code) -> require('LiveScript').compile code, bare: options.bare
    import_re: /^#import (".+")$/gm

module.exports = {compile, extensions}
