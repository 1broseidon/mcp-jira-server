# Jira MCP Server

A Model Context Protocol server that provides integration with Jira's REST API, allowing AI assistants to manage Jira issues programmatically.

<a href="https://glama.ai/mcp/servers/2a6ts4367i"><img width="380" height="200" src="https://glama.ai/mcp/servers/2a6ts4367i/badge" alt="mcp-jira-server MCP server" /></a>

## Features

This server provides tools for managing Jira issues:

- Create new issues (Tasks, Epics, Subtasks)
- List issues with optional status filtering
- Update existing issues (summary, description, status)
- Get detailed issue information
- Delete issues
- Add comments to issues

## Setup

### Prerequisites

1. A Jira account with API access
2. Jira API token (can be generated from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens))

### Installation

1. Install dependencies:

```bash
npm install
```

2. Build the server:

```bash
npm run build
```

### Configuration

1. Create a `.jira-config.json` file in your working directory:

```json
{
  "projectKey": "YOUR_PROJECT_KEY"
}
```

2. Configure the MCP server with your Jira credentials:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/path/to/jira-server/build/index.js"],
      "env": {
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_DOMAIN": "your-domain"
      }
    }
  }
}
```

## Available Tools

### create_issue

Creates a new Jira issue

- Required parameters:
  - working_dir: Directory containing .jira-config.json
  - summary: Issue title
  - description: Issue description
  - type: Issue type (Task, Epic, or Subtask)

### list_issues

Lists issues in the project

- Required parameters:
  - working_dir: Directory containing .jira-config.json
- Optional parameters:
  - status: Filter by status (e.g., "To Do", "In Progress", "Done")

### update_issue

Updates an existing issue

- Required parameters:
  - working_dir: Directory containing .jira-config.json
  - issue_key: Issue key (e.g., PRJ-123)
- Optional parameters:
  - summary: New title
  - description: New description
  - status: New status

### get_issue

Gets detailed information about a specific issue

- Required parameters:
  - working_dir: Directory containing .jira-config.json
  - issue_key: Issue key (e.g., PRJ-123)

### delete_issue

Deletes a Jira issue

- Required parameters:
  - working_dir: Directory containing .jira-config.json
  - issue_key: Issue key (e.g., PRJ-123)

### add_comment

Adds a comment to an existing issue

- Required parameters:
  - working_dir: Directory containing .jira-config.json
  - issue_key: Issue key (e.g., PRJ-123)
  - comment: Comment text to add

## Development

For development with auto-rebuild:

```bash
npm run watch
```

### Error Handling

The server includes comprehensive error handling for:

- Invalid project keys
- Missing configuration
- Invalid issue types
- API authentication errors
- Invalid status transitions

### Output Formatting

Issue information is formatted to include:

- Issue key and summary
- Issue type and status
- Creation date and creator
- Description
- Comments (if any) with author and timestamp
