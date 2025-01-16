# Jira MCP Server

A Model Context Protocol server that provides integration with Jira's REST API, allowing AI assistants to manage Jira issues programmatically.

## Features

This server provides tools for managing Jira issues:

- Create new issues (Tasks, Epics, Subtasks)
- List issues with optional status filtering
- Update existing issues (summary, description, status)
- Story points management with automatic field detection
- Sprint management (add/remove issues to/from sprints)
- Get detailed issue information
- Delete issues
- Add comments to issues

## Setup

### Prerequisites

1. A Jira account with API access
2. Jira API token (can be generated from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens))
3. Story Points field configured in your Jira project (optional)

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
  "projectKey": "YOUR_PROJECT_KEY",
  "storyPointsField": "customfield_XXXXX"  // Optional, auto-detected if not set
}
```

2. Configure the MCP server with your Jira credentials:

#### For VS Code
Add to settings file: `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/path/to/jira-server/build/index.js"],
      "cwd": "/path/to/jira-server",
      "env": {
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_DOMAIN": "your-domain"
      },
      "disabled": false,
      "alwaysAllow": [
        "create_issue",
        "list_issues",
        "update_issue",
        "get_issue",
        "delete_issue",
        "add_comment"
      ]
    }
  }
}
```

#### For Claude Desktop
Add to: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/path/to/jira-server/build/index.js"],
      "cwd": "/path/to/jira-server",
      "env": {
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_DOMAIN": "your-domain"
      },
      "disabled": false,
      "alwaysAllow": true
    }
  }
}
```

Key differences between VS Code and Claude Desktop:
- VS Code requires specific tool permissions in `alwaysAllow`
- Claude Desktop can use `"alwaysAllow": true` for all tools
- Both need `cwd` set to ensure correct config file loading

## Available Tools

### create_issue

Creates a new Jira issue

- Required parameters:
  - working_dir: Directory containing .jira-config.json
  - summary: Issue title
  - description: Issue description
  - type: Issue type (Task, Epic, or Subtask)
- Optional parameters:
  - epic_link: Epic issue key to link to
  - priority: Issue priority (Highest, High, Medium, Low, Lowest)
  - story_points: Story point value (e.g., 1, 2, 3, 5, 8)
  - labels: Array of label strings
  - sprint: Sprint name or "current" for active sprint

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
  - epic_link: Epic key to link to, empty string to remove
  - priority: Issue priority (Highest, High, Medium, Low, Lowest)
  - story_points: Story point value (e.g., 1, 2, 3, 5, 8)
  - labels: Array of labels, replaces existing
  - sprint: Sprint name or "current", empty string to remove

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

## Advanced Features

### Story Points Management

The server includes automatic story points field detection and management:

1. Field Detection:
   - Automatically detects Story Points custom field
   - Provides configuration guidance in debug output
   - Supports field ID customization in config

2. Configuration:
   ```json
   {
     "projectKey": "YOUR_PROJECT_KEY",
     "storyPointsField": "customfield_XXXXX"  // Optional, auto-detected if not set
   }
   ```

3. Usage:
   - Set points during issue creation
   - Update points on existing issues
   - Remove points by setting to null
   ```json
   {
     "working_dir": "/path/to/config",
     "issue_key": "PRJ-123",
     "story_points": 5
   }
   ```

### Sprint Management

The server supports comprehensive sprint management:

- Add issues to sprints using name or "current"
- Remove issues from sprints
- Automatic sprint field detection
- Support for active and future sprints

Example:
```json
{
  "working_dir": "/path/to/config",
  "issue_key": "PRJ-123",
  "sprint": "Sprint 1"  // or "current" for active sprint
}
```

## Development

For development with auto-rebuild:

```bash
npm run watch
```

## Troubleshooting

The server provides extensive debug logging:

1. Configuration Loading:
   - Shows working directory parameter
   - Lists all attempted config locations
   - Displays found config content
   - Reports config parsing results

2. Field Detection:
   - Logs story points field detection
   - Shows available custom fields
   - Provides configuration suggestions

3. Common Issues:

   a. Story Points Not Updating:
      - Check debug logs for "Found Story Points field" message
      - Verify field ID in config matches Jira's custom field
      - Ensure proper permissions for field access

   b. Sprint Operations:
      - Verify sprint exists and is active/future
      - Check sprint name matches exactly
      - Review available sprints in debug output

   c. Config File Issues:
      - Server checks multiple locations in order:
        1. Current working directory (process.cwd())
        2. Server installation directory
        3. Provided working_dir parameter
      - Debug logs show each location checked

For Claude Desktop (mac), you can tail the log located at:
**/Users/username/Library/Logs/Claude/mcp-server-jira.log**

```bash/zshrc
tail -n 20 -f ~/Library/Logs/Claude/mcp-server-jira.log
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
- Story points (when configured)
- Sprint information
- Comments (if any) with author and timestamp
