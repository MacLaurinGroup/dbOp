/**
 * Class to handle
 *
 * (c) Transforce 2018
 */
"use strict";

const fs = require("fs");
const readline = require("readline");
const Mustache = require("mustache");

class classSQLFileRunner {

  constructor(_dbConn, _options) {
    this.dbConn = _dbConn;
    this.options = (typeof _options != "undefined") ? _options : {};
    this.delimiter = (typeof this.options.delimiter != "undefined") ? this.options.delimiter : "";
    delete this.options.delimiter;
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

        if (classThis.delimiter == "per-line") {
          classThis.__executeStatement(line);
        } else {
          if (line.trim() == classThis.delimiter || (classThis.delimiter.length == 0 && line.length == 0)) {
            if (stmtBlock != "") {
              statements.push(stmtBlock);
            }
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

    if ( Object.keys(this.options).length > 0 )
      stmt = Mustache.render( stmt, this.options );

    await this.dbConn.query(stmt);
  }
};

module.exports = classSQLFileRunner;
