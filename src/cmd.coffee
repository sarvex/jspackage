{compile} = require('./jspackage')
fs = require('fs')
optparse = require('optparse')

switches = [
  ['-h', '--help', "shows this help section"]
  ['-b', '--bare', "compile without a top-level function wrapper"]
  ['-w', '--watch', "watch source files and recompile when any change"]
]

parser = new optparse.OptionParser(switches)

printUsage = ->
  parser.banner = "Usage: jspackage input_file [output_file] [options]"
  console.log(parser.toString())

parser.on 'help', ->
  printUsage()
  process.exit(1)

options = {}
parser.on 0, (arg) ->
  options.mainfile = arg

output = null
parser.on 1, (arg) ->
  output = arg

parser.on "bare", ->
  options.bare = true

parser.on "watch", ->
  options.watch = true

parser.parse(process.argv.splice(2))

if not options.mainfile
  printUsage()
  process.exit(1)

if output
  compile options, (err, code) ->
    if options.watch
      timestamp = (new Date()).toLocaleTimeString()
      if err
        console.error("#{timestamp}  - error: #{err}")
      else
        console.info("#{timestamp} - generated #{output}")
        fs.writeFile(output, code)
    else
      if (err) then throw err
      fs.writeFile(output, code)
