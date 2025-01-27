require("dotenv").config();
const TestRail = require("testrail");
const stripAnsi = require("strip-ansi");

const api = new TestRail({
  host: process.env.NETWORK_URL,
  user: process.env.USERNAME,
  password: process.env.PASSWORD,
});

class Reporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;
    this.caseids = {};
    this.testRailResults = {};
  }

  async createRun(projectId) {
    const now = new Date();

    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };

    const message = 'Automated test run';

    Promise.all(
      Object.entries(this.testRailResults).map(async ([suiteId, results]) => {
        const suite = await api.getSuite(suiteId);
        const name = `${suite.name} - ${now.toLocaleString(
          ['en-GB'],
          options
        )} - (${message})`;

        try {
          const run = await api
            .addRun(projectId, {
              suite_id: suiteId,
              name: name,
              include_all: false,
              case_ids: this.caseids[suiteId],
            })

          console.log('Created new test run: ' + name);

          await api.addResultsForCases(run.id, {
            results,
          });

          await api.closeRun(run.id);

          console.log('Added test results and closed test run');
        } catch (err) {
          console.log(err.message || err);
        }
      })
    );
  }

  onRunComplete(contexts, results) {
    const specResults = results.testResults;
    for (let j = 0; j < specResults.length; j += 1) {
      const itResults = specResults[j].testResults;

      for (let i = 0; i < itResults.length; i += 1) {
        const result = itResults[i];
        /**
         * Testrails Suite ID. Pulls from the top-most describe block if possible,
         * otherwise attempts to use a suite_id from the reporter options.
         */
        const suiteId = (() => {
          const {
            ancestorTitles: [parentTitle],
          } = result;

          if (parentTitle) {
            const [titleHeader] = parentTitle.split(':');
            return parseInt(titleHeader, 10);
          }

          return this._options.suite_id;
        })();

        const caseId = (() => {
          const { title } = result;
          const [titleHeader] = title.split(':');

          return parseInt(titleHeader, 10);
        })();

        if (!Number.isInteger(caseId) || !Number.isInteger(suiteId)) {
          break;
        }

        if (!Array.isArray(this.testRailResults[suiteId])) {
          this.testRailResults[suiteId] = [];
        }

        if (!Array.isArray(this.caseids[suiteId])) {
          this.caseids[suiteId] = [];
        }

        this.caseids[suiteId].push(caseId);

        switch (result.status) {
          case 'pending':
            this.testRailResults[suiteId].push({
              case_id: caseId,
              status_id: 2,
              comment: 'Intentionally skipped (xit).',
            });
            break;

          case 'failed':
            this.testRailResults[suiteId].push({
              case_id: caseId,
              status_id: 5,
              comment: stripAnsi(result.failureMessages[0]),
            });
            break;

          case 'passed':
            this.testRailResults[suiteId].push({
              case_id: caseId,
              status_id: 1,
              comment: 'Test passed successfully.',
            });
            break;

          default:
            // unknown status
            break;
        }
      }
    }
    this.createRun(this._options.project_id);
  }
}

module.exports = Reporter;
