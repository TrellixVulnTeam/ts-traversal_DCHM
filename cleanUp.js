"use strict";
exports.__esModule = true;
var fs = require('fs');
var path = require("path");
var OCTAVEC = "/home/dlg59/project/Halo-Algorithm/OctaveC";
var helperFunctions_1 = require("./helperFunctions");
var args = process.argv.slice(2);
if (args.length != 2) {
    process.exit(1);
}
var mfile = args[0];
//let out_folder = args[1];
var out_folder = args[1] + "/generatedCode/" + path.parse(mfile).name;
if (!fs.existsSync(out_folder)) {
    fs.mkdirSync(out_folder);
}
if (!fs.existsSync("".concat(out_folder, "/").concat(mfile))) {
    fs.copyFile("".concat(OCTAVEC, "/tests/").concat(mfile), "".concat(out_folder, "/").concat(mfile), function (err) {
        if (err)
            throw err;
    });
}
console.log((0, helperFunctions_1.waitForFileExists)("".concat(out_folder, "/").concat(mfile), 0, 8000));
var code = fs.readFileSync("".concat(out_folder, "/").concat(mfile), "utf8");
// Comment out directives
var comment_lines = ["more", "format", "source"];
for (var _i = 0, comment_lines_1 = comment_lines; _i < comment_lines_1.length; _i++) {
    var comment_line = comment_lines_1[_i];
    //let re = new RegExp(`^(${comment_line}|\n${comment_line})\\s[\\w;\.]*\\n`, "g");
    var re = new RegExp("".concat(comment_line, "\\s[\\w;.]*\\n"), "g");
    var match = code.match(re);
    if (match != null) {
        code = code.replace(re, "%".concat(match));
    }
}
// Replace binary operators in complex numbers
//code = code.replace(/(\*i)|(\*I)|/g, 'i');
code = code.replace(/\*I/g, 'i');
code = code.replace(/\*i/g, 'i');
// Replace augmented assignment
var idx = code.indexOf("++");
while (idx != -1) {
    var tmp = code.slice(0, idx).split(/[\s,\n]/);
    var variable = tmp.splice(-1);
    code = code.replace("".concat(variable, "++"), "".concat(variable, " = ").concat(variable, " + 1"));
    idx = code.indexOf("++");
}
// Replace complexDisp and doubleDisp
code = code.replace(/complexDisp/g, 'disp');
code = code.replace(/doubleDisp/g, 'disp');
code = code.replace(/intDisp/g, 'disp');
(0, helperFunctions_1.writeToFile)(out_folder, mfile, code);
//# sourceMappingURL=cleanUp.js.map