var url = require('url')
console.log(url.parse(window.location.href))

var file = require('fs').readFileSync(__dirname + '/..a/README.md', 'utf8')
console.log(file)