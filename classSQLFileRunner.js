/**
 * Class to handle
 *
 * (c) Transforce 2018
 */
"use strict";

const fs = require("fs");
const readline = require("readline");

class classSQLFileRunner {

  constructor(_dbConn, _options) {
    this.dbConn = _dbConn;
    this.options = (typeof _options != "undefined") ? _options : {};
    this.options.delimiter = (typeof this.options.delimiter != "undefined") ? this.options.delimiter : "";
  }

  async doFile(filename) {
    const classThis = this;

    const promise = new Promise(function(resolve, reject) {
      const rl = readline.createInterface({
        input: fs.createReadStream(filename),
        terminal: false
      });

      const statements = [];
      let stmtBlock = "";

      rl.on("line", function(chunk) {
        let line = chunk.toString("ascii");

        if (classThis.options.delimiter == "per-line") {
          classThis.__executeStatement(line);
        } else {
          if (line.trim() == classThis.options.delimiter || (classThis.options.delimiter.length == 0 && line.length == 0)) {
            if (stmtBlock != "") {
              statements.push(stmtBlock);
            }
            //classThis.__executeStatement(stmtBlock);
            stmtBlock = "";
          } else {
            stmtBlock += line + "\r\n";
          }
        };
      });

      rl.on("close", function() {
        resolve(statements);
      });

    });

    let stArray;
    await promise.then((statements) => {
      stArray = statements;
    });

    // Run around the statements and execute
    for (let stmt of stArray)
      await this.__executeStatement(stmt);
  }


  async __executeStatement(stmt) {
    if (stmt.trim() == "")
      return;

    await this.dbConn.query(stmt);
  }
};

module.exports = classSQLFileRunner;
