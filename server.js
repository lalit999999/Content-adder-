const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

// Set target repo folder (defaults to server root directory)
const REPO_DIR = process.env.REPO_DIR || __dirname;
const README_PATH = path.join(REPO_DIR, 'README.md');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/update-readme', async (req, res) => {
  const { content, commitMessage } = req.body;

  // Stream progress events to frontend
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendStage = (stage, status, details = '') => {
    res.write(`data: ${JSON.stringify({ stage, status, details })}\n\n`);
  };

  try {
    // Input validation
    if (!content || !content.trim()) {
      sendStage(1, 'error', 'Validation Error: Content cannot be empty.');
      return res.end();
    }

    const commitMsg = commitMessage?.trim() || 'docs: update README.md via Web UI';

    // STAGE 1: File Write / Append
    sendStage(1, 'active', 'Appending content to README.md...');
    try {
      await fs.appendFile(README_PATH, `\n\n${content.trim()}`);
      sendStage(1, 'success', 'Content written to README.md successfully.');
    } catch (err) {
      throw new Error(`File Write Failed: ${err.message}`);
    }

    // STAGE 2: Git Add
    sendStage(2, 'active', 'Running git add README.md...');
    try {
      await execPromise('git add README.md', { cwd: REPO_DIR });
      sendStage(2, 'success', 'File staged in Git.');
    } catch (err) {
      throw new Error(`Git Add Failed: ${err.stderr || err.message}`);
    }

    // STAGE 3: Git Commit
    sendStage(3, 'active', 'Creating git commit...');
    try {
      const sanitizedMsg = commitMsg.replace(/"/g, '\\"');
      await execPromise(`git commit -m "${sanitizedMsg}"`, { cwd: REPO_DIR });
      sendStage(3, 'success', 'Commit created successfully.');
    } catch (err) {
      throw new Error(`Git Commit Failed: ${err.stderr || err.message}`);
    }

    // STAGE 4: Git Push
    sendStage(4, 'active', 'Pushing changes to GitHub...');
    try {
      await execPromise('git push', { cwd: REPO_DIR });
      sendStage(4, 'success', 'Successfully pushed changes to GitHub repo!');
    } catch (err) {
      throw new Error(`Git Push Failed: ${err.stderr || err.message}`);
    }

    sendStage(5, 'complete', 'Process complete!');
  } catch (error) {
    sendStage(-1, 'error', error.message);
  } finally {
    res.end();
  }
});
console.log("hello from express , i am adding a pull request for testing");

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
