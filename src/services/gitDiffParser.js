var Parser, exports;

Parser = (function() {
  function Parser(lines1) {
    var line;
    this.lines = lines1;
    this.ln = 0;
    this.result = {
      detailed: false,
      commits: []
    };
    while (this.ln < this.lines.length) {
      line = this.lines[this.ln];
      if (line.indexOf("From ") === 0) {
        this.parseMetadata();
      } else if (line.indexOf("diff ") === 0) {
        this.parseDiff();
      } else {
        this.ln++;
      }
    }
    if (this.currentCommit) {
      this.result.commits.push(this.currentCommit);
    }
  }

  Parser.prototype.parseMetadata = function() {
    var isGettingMessage, line, matches, results;
    this.result.detailed = true;
    if (this.currentCommit) {
      this.result.commits.push(this.currentCommit);
    }
    this.currentCommit = {
      files: []
    };
    isGettingMessage = false;
    results = [];
    while (this.ln < this.lines.length) {
      line = this.lines[this.ln];
      if (line.indexOf("diff ") === 0) {
        break;
      }
      if (isGettingMessage) {
        if (line.indexOf("---") === 0) {
          isGettingMessage = false;
          matches = this.currentCommit.message.match(/^\[PATCH\s(\d*)\/(\d*)\](.*)/);
          if (matches.length === 4) {
            this.currentCommit.message = matches[3].trim();
          }
        } else {
          this.currentCommit.message += line.indexOf(" ") === 0 ? line : "\n" + line;
        }
      } else if (line.indexOf("From ") === 0) {
        matches = line.match(/^From\s([a-z|0-9]*)\s(\w.*)$/);
        if (matches.length === 3) {
          this.currentCommit.sha = matches[1];
          this.currentCommit.date = new Date(matches[2]);
        }
      } else if (line.indexOf("From: ") === 0) {
        matches = line.match(/^From:\s(.*)\s\<(\w.*)\>$/);
        if (matches.length === 3) {
          this.currentCommit.author = matches[1];
          this.currentCommit.email = matches[2];
        } else {
          console.log(line);
          exit();
        }
      } else if (line.indexOf("Date: ") === 0) {
        matches = line.match(/^Date:\s(\w.*)$/);
        if (matches.length === 2) {
          this.currentCommit.date = new Date(matches[1]);
        }
      } else if (line.indexOf("Subject: ") === 0) {
        this.currentCommit.message = line.substr(9);
        isGettingMessage = true;
      }
      results.push(this.ln++);
    }
    return results;
  };

  Parser.prototype.parseDiff = function() {
    var file, firstRun, line, lineBreak, lnAdd, lnDel, matches, noeol, parseFile;
    if (!this.currentCommit) {
      this.currentCommit = {
        files: []
      };
    }
    parseFile = function(s) {
      var t;
      s = s.trim();
      t = /\d{4}-\d\d-\d\d\s\d\d:\d\d:\d\d(.\d+)?\s(\+|-)\d\d\d\d/.exec(s);
      if (t) {
        s = s.substring(0, t.index).trim();
      }
      if (s.match(/^(a|b)\//)) {
        return s.substr(2);
      } else {
        return s;
      }
    };
    file = {
      deleted: false,
      added: false,
      renamed: false,
      binary: false,
      lines: []
    };
    firstRun = true;
    lineBreak = false;
    lnDel = 0;
    lnAdd = 0;
    noeol = "\\ No newline at end of file";
    while (this.ln < this.lines.length) {
      line = this.lines[this.ln];
      if ((line.indexOf("diff ") === 0 && !firstRun) || (this.result.detailed && line === "-- ")) {
        break;
      }
      if (line.indexOf("diff ") === 0) {
        matches = line.match(/^diff\s\-\-git\s(a\/.*)\s(b\/.*)$/);
        if (matches.length === 3) {
          file.from = parseFile(matches[1]);
          file.to = parseFile(matches[2]);
        }
      } else if (line.indexOf("+++ ") === 0) {
        if (!file.to) {
          file.to = parseFile(line.substr(4));
        }
      } else if (line.indexOf("--- ") === 0) {
        if (!file.from) {
          file.from = parseFile(line.substr(4));
        }
      } else if (line === "GIT binary patch") {
        file.binary = true;
        break;
      } else if (/^deleted file mode \d+$/.test(line)) {
        file.deleted = true;
      } else if (/^new file mode \d+$/.test(line)) {
        file.added = true;
      } else if (/^new file mode \d+$/.test(line)) {
        file.added = true;
      } else if (/^index\s[\da-zA-Z]+\.\.[\da-zA-Z]+(\s(\d+))?$/.test(line)) {
        file.index = line.split(' ').slice(1);
      } else if (/^Binary\sfiles\s(.*)differ$/.test(line)) {
        file.binary = true;
        break;
      } else if (/^@@\s+\-(\d+),(\d+)\s+\+(\d+),(\d+)\s@@/.test(line)) {
        matches = line.match(/^@@\s+\-(\d+),(\d+)\s+\+(\d+),(\d+)\s@@/);
        lineBreak = file.lines.length !== 0;
        lnDel = +matches[1];
        lnAdd = +matches[3];
      } else {
        if (/^-/.test(line)) {
          file.lines.push({
            type: "deleted",
            "break": lineBreak && !file.added,
            text: line.substr(1),
            ln1: line !== noeol ? lnDel++ : void 0
          });
        } else if (/^\+/.test(line)) {
          file.lines.push({
            type: "added",
            "break": lineBreak && !file.added,
            text: line.substr(1),
            ln1: line !== noeol ? lnAdd++ : void 0
          });
        } else {
          if (line !== noeol) {
            file.lines.push({
              type: "normal",
              "break": lineBreak && !file.added,
              text: line.substr(1),
              ln1: line !== noeol ? lnDel++ : void 0,
              ln2: line !== noeol ? lnAdd++ : void 0
            });
          }
        }
        lineBreak = false;
      }
      firstRun = false;
      this.ln++;
    }
    if (file.from === "/dev/null") {
      file.added = true;
    } else {
      file.renamed = !file.added && !file.deleted && file.to !== file.from;
      if (file.renamed) {
        file.oldName = file.from;
      }
    }
    file.name = file.to;
    if (file.lines.length === 0 && !this.result.detailed) {
      file.binary = true;
    }
    delete file.from;
    delete file.to;
    return this.currentCommit.files.push(file);
  };

  return Parser;

})();

module.exports = exports = function(input) {
  var lines, result;
  result = {};
  if (input instanceof Buffer) {
    input = input.toString();
  }
  lines = input.split("\n");
  return (new Parser(lines)).result;
};

// ---
// generated by coffee-script 1.9.2