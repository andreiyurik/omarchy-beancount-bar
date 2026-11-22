// Loads Model.js (a QML JavaScript library) in Node.
const fs = require("fs"), path = require("path")
const source = fs.readFileSync(path.join(__dirname, "..", "Model.js"), "utf8").replace(/^\.pragma library\n/, "")
const module_ = {exports: {}}
new Function("module", source)(module_)
module.exports = module_.exports
