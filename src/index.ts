#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import fs from "fs";
import path from "path";

const JIRA_EMAIL = process.env.JIRA_EMAIL as string;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN as string;
const JIRA_DOMAIN = process.env.JIRA_DOMAIN as string;

if (!JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_DOMAIN) {
  throw new Error(
    "JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_DOMAIN environment variables are required"
  );
}

interface JiraConfig {
  projectKey: string;
  storyPointsField?: string; // Custom field ID for story points (e.g., 'customfield_10016')
}

interface JiraComment {
  id: string;
  body: string;
  created: string;
  author: {
    displayName: string;
  };
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: string;
    status: {
      name: string;
    };
    issuetype: {
      name: string;
    };
    created: string;
    creator: {
      displayName: string;
    };
    priority?: {
      name: string;
      id?: string;
    };
    comment?: {
      comments: JiraComment[];
    };
    parent?: {
      key: string;
      fields: {
        summary: string;
      };
    };
    [key: string]: any; // Allow dynamic story points field
  };
}

class JiraServer {
  private server: Server;
  private axiosInstance;
  private agileAxiosInstance;
  private currentProjectKey: string | null = null;
  private storyPointsField: string | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "jira-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Create separate instances for REST API v2 and Agile API
    this.axiosInstance = axios.create({
      baseURL: `https://${JIRA_DOMAIN}.atlassian.net/rest/api/2`,
      auth: {
        username: JIRA_EMAIL,
        password: JIRA_API_TOKEN,
      },
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    this.agileAxiosInstance = axios.create({
      baseURL: `https://${JIRA_DOMAIN}.atlassian.net/rest/agile/1.0`,
      auth: {
        username: JIRA_EMAIL,
        password: JIRA_API_TOKEN,
      },
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
private async inspectSprints(): Promise<void> {
  const boardId = await this.getBoardId();
  console.error("Found board ID:", boardId);

  const sprintsResponse = await this.agileAxiosInstance.get(
    `/board/${boardId}/sprint`,
    {
      params: {
        state: 'active,closed,future'
      }
    }
  );
  
  console.error("Available sprints:", JSON.stringify(sprintsResponse.data, null, 2));
}

private async inspectIssueFields(issueKey: string): Promise<void> {
  // Get field configuration first
  const fieldConfigResponse = await this.axiosInstance.get('/field');
  
  // Look specifically for Story Points field
  const storyPointsFields = fieldConfigResponse.data
    .filter((field: any) => {
      const nameMatch = field.name?.toLowerCase().includes('story point');
      const descMatch = field.description?.toLowerCase().includes('story point');
      return nameMatch || descMatch;
    });
  
  console.error("Story Points Fields:", JSON.stringify(storyPointsFields, null, 2));

  // Get available field metadata for the project
  const metadataResponse = await this.axiosInstance.get('/issue/createmeta', {
    params: {
      projectKeys: this.currentProjectKey,
      expand: 'projects.issuetypes.fields'
    }
  });

  // Look for Story Points in available fields
  const availableFields = metadataResponse.data.projects[0].issuetypes[0].fields;
  const storyPointsInMeta = Object.entries(availableFields)
    .filter(([_, value]: [string, any]) =>
      value.name?.toLowerCase().includes('story point') ||
      value.description?.toLowerCase().includes('story point')
    );
  
  console.error("Story Points in Metadata:", JSON.stringify(storyPointsInMeta, null, 2));

  // Get current field values
  const response = await this.axiosInstance.get(`/issue/${issueKey}`, {
    params: {
      expand: "renderedFields,names,schema,editmeta",
      fields: "*all"
    }
  });
  
  // Look for potential Story Points values in custom fields
  const customFields = Object.entries(response.data.fields)
    .filter(([key, value]) =>
      key.startsWith('customfield_') &&
      (typeof value === 'number' || value === null)
    )
    .reduce((acc: any, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  
  console.error("Potential Story Points Fields:", JSON.stringify(customFields, null, 2));
}

private async checkStoryPointsField(): Promise<void> {
  const fieldConfigResponse = await this.axiosInstance.get('/field');
  const storyPointsFields = fieldConfigResponse.data
    .filter((field: any) => {
      // Look specifically for "Story Points" field
      return field.name === 'Story Points';
    });
  
  if (storyPointsFields.length === 0) {
    console.error(`Story Points field not found. Please ensure:
1. The "Story Points" field is configured in Jira
2. The field is added to the appropriate screens (create/edit) for your issue types
3. You have the necessary permissions to access and modify the field`);
  } else {
    const field = storyPointsFields[0];
    console.error(`Found Story Points field: ${field.name} (${field.id})`);
    if (!this.storyPointsField) {
      console.error(`To enable Story Points support, add this to .jira-config.json:
"storyPointsField": "${field.id}"`);
    }
  }
}

private formatIssue(issue: JiraIssue): string {
  let output = `${issue.key}: ${issue.fields.summary}
- Type: ${issue.fields.issuetype.name}
- Status: ${issue.fields.status.name}
- Priority: ${issue.fields.priority?.name || "Not set"}`;

  // Only show Story Points if field is configured
  if (this.storyPointsField && issue.fields[this.storyPointsField] !== undefined) {
    output += `\n- Story Points: ${issue.fields[this.storyPointsField] || "Not set"}`;
  }

  output += `\n- Created: ${this.formatDate(issue.fields.created)}
- Description: ${issue.fields.description || "No description"}
- Creator: ${issue.fields.creator.displayName}`;

  // Add labels if any exist
  if (issue.fields.labels && issue.fields.labels.length > 0) {
    output += `\n- Labels: ${issue.fields.labels.join(", ")}`;
  }

  if (issue.fields.parent) {
    output += `\n- Parent Epic: ${issue.fields.parent.key} - ${issue.fields.parent.fields.summary}`;
  }

  // Add Epic link information if available
  for (const [fieldId, value] of Object.entries(issue.fields)) {
    if (fieldId.startsWith('customfield_') && value && typeof value === 'string') {
      output += `\n- Epic Link: ${value}`;
    }
  }

    const comments = issue.fields.comment?.comments;
    if (comments && comments.length > 0) {
      output += "\n\nComments:";
      comments.forEach((comment) => {
        output += `\n\n[${this.formatDate(comment.created)} by ${
          comment.author.displayName
        }]\n${comment.body}`;
      });
    }

    return output;
  }

  private formatIssueList(issues: JiraIssue[]): string {
    if (issues.length === 0) {
      return "No issues found.";
    }

    const formattedIssues = issues
      .map((issue) => this.formatIssue(issue))
      .join("\n");
    return `Latest Jira Issues in ${this.currentProjectKey} Project:\n\n${formattedIssues}\nTotal Issues: ${issues.length}`;
  }

  private formatCreatedIssue(issue: any): string {
    return `Issue created successfully:
- Key: ${issue.key}
- URL: https://${JIRA_DOMAIN}.atlassian.net/browse/${issue.key}`;
  }

  private async getBoardId(): Promise<number> {
    // Use Agile REST API to find the board for the project
    const boardsResponse = await this.agileAxiosInstance.get(
      `/board`,
      {
        params: {
          projectKeyOrId: this.currentProjectKey
        }
      }
    );
    
    if (!boardsResponse.data.values.length) {
      throw new McpError(ErrorCode.InvalidRequest, 'No board found for project');
    }
    
    return boardsResponse.data.values[0].id;
  }

  private async getActiveSprint(boardId: number): Promise<number | null> {
    const sprintsResponse = await this.agileAxiosInstance.get(
      `/board/${boardId}/sprint`,
      {
        params: {
          state: 'active'
        }
      }
    );
    
    if (!sprintsResponse.data.values.length) {
      return null;
    }
    
    return sprintsResponse.data.values[0].id;
  }

  private async loadProjectKey(workingDir: string): Promise<string> {
    console.error("Received working_dir parameter:", workingDir);
    
    // List of potential config locations, prioritizing process.cwd()
    const configLocations = [
      process.cwd(),
      "/Users/robsherman/Servers/mcp-jira-server",
      workingDir
    ];
    
    console.error("Will try these config locations:", configLocations);
    
    let lastError: Error | null = null;
    
    // Try each location
    for (const location of configLocations) {
      try {
        const configPath = path.join(location, ".jira-config.json");
        console.error("\nTrying config path:", configPath);
        
        const configContent = await fs.promises.readFile(configPath, "utf-8");
        console.error("Found config content:", configContent);
        
        const config: JiraConfig = JSON.parse(configContent);
        console.error("Parsed config:", JSON.stringify(config, null, 2));
        
        if (!config.projectKey) {
          console.error("No projectKey found in config, trying next location");
          continue;
        }
        
        // Store story points field ID if available
        console.error("Checking for story points field in config...");
        if (config.storyPointsField) {
          console.error("Found story points field in config:", config.storyPointsField);
          this.storyPointsField = config.storyPointsField;
        } else {
          console.error("No story points field found in this config");
          this.storyPointsField = null;
        }
        
        console.error("Successfully loaded config from:", configPath);
        return config.projectKey;
        
      } catch (error) {
        console.error("Error trying location", location, ":", error);
        lastError = error as Error;
      }
    }
    
    // If we get here, no config was found
    console.error("Failed to load config from any location");
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Failed to load project key from .jira-config.json. Tried locations: ${configLocations.join(", ")}`
    );
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "create_issue",
          description: "Create a new Jira issue",
          inputSchema: {
            type: "object",
            properties: {
              working_dir: {
                type: "string",
                description: "Working directory containing .jira-config.json",
              },
              summary: {
                type: "string",
                description: "Issue summary/title",
              },
              description: {
                type: "string",
                description: "Issue description",
              },
              type: {
                type: "string",
                description: "Issue type (Task, Epic, or Subtask)",
              },
              epic_link: {
                type: "string",
                description: "Epic issue key to link to (e.g., AIS-27)",
              },
              priority: {
                type: "string",
                description: "Issue priority (e.g., 'Highest', 'High', 'Medium', 'Low', 'Lowest')",
              },
              story_points: {
                type: "number",
                description: "Story Points estimate (e.g., 1, 2, 3, 5, 8)",
              },
              labels: {
                type: "array",
                items: {
                  type: "string"
                },
                description: "Labels to add to the issue",
              },
              sprint: {
                type: "string",
                description: "Sprint name or 'current' to add to active sprint",
              },
            },
            required: ["working_dir", "summary", "description", "type"],
          },
        },
        {
          name: "list_issues",
          description: "List issues in the project",
          inputSchema: {
            type: "object",
            properties: {
              working_dir: {
                type: "string",
                description: "Working directory containing .jira-config.json",
              },
              status: {
                type: "string",
                description:
                  'Filter by status (e.g., "To Do", "In Progress", "Done")',
              },
            },
            required: ["working_dir"],
          },
        },
        {
          name: "update_issue",
          description: "Update an existing issue",
          inputSchema: {
            type: "object",
            properties: {
              working_dir: {
                type: "string",
                description: "Working directory containing .jira-config.json",
              },
              issue_key: {
                type: "string",
                description: "Issue key (e.g., PRJ-123)",
              },
              summary: {
                type: "string",
                description: "New summary/title",
              },
              description: {
                type: "string",
                description: "New description",
              },
              status: {
                type: "string",
                description: "New status",
              },
              epic_link: {
                type: "string",
                description: "Epic issue key to link to (e.g., AIS-27). Set to empty string to remove epic link.",
              },
              priority: {
                type: "string",
                description: "Issue priority (e.g., 'Highest', 'High', 'Medium', 'Low', 'Lowest')",
              },
              story_points: {
                type: "number",
                description: "Story Points estimate (e.g., 1, 2, 3, 5, 8). Set to null to remove story points.",
              },
              labels: {
                type: "array",
                items: {
                  type: "string"
                },
                description: "Labels for the issue. Replaces all existing labels.",
              },
              sprint: {
                type: "string",
                description: "Sprint name or 'current' to add to active sprint. Set to empty string to remove from sprint.",
              },
            },
            required: ["working_dir", "issue_key"],
          },
        },
        {
          name: "get_issue",
          description: "Get details of a specific issue",
          inputSchema: {
            type: "object",
            properties: {
              working_dir: {
                type: "string",
                description: "Working directory containing .jira-config.json",
              },
              issue_key: {
                type: "string",
                description: "Issue key (e.g., PRJ-123)",
              },
            },
            required: ["working_dir", "issue_key"],
          },
        },
        {
          name: "delete_issue",
          description: "Delete a Jira issue",
          inputSchema: {
            type: "object",
            properties: {
              working_dir: {
                type: "string",
                description: "Working directory containing .jira-config.json",
              },
              issue_key: {
                type: "string",
                description: "Issue key (e.g., PRJ-123)",
              },
            },
            required: ["working_dir", "issue_key"],
          },
        },
        {
          name: "add_comment",
          description: "Add a comment to an existing issue",
          inputSchema: {
            type: "object",
            properties: {
              working_dir: {
                type: "string",
                description: "Working directory containing .jira-config.json",
              },
              issue_key: {
                type: "string",
                description: "Issue key (e.g., PRJ-123)",
              },
              comment: {
                type: "string",
                description: "Comment text to add to the issue",
              },
            },
            required: ["working_dir", "issue_key", "comment"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { working_dir, ...args } = request.params.arguments as any;
        this.currentProjectKey = await this.loadProjectKey(working_dir);

        switch (request.params.name) {
          case "create_issue": {
            const { summary, description, type, epic_link, sprint, priority, story_points, labels } = args;

            console.error("Creating issue with:", {
              projectKey: this.currentProjectKey,
              summary,
              description,
              type,
              epic_link,
              sprint,
              priority,
              story_points,
              labels,
            });

            // First, get project metadata to verify it exists and get available issue types
            const metaResponse = await this.axiosInstance.get(
              "/issue/createmeta",
              {
                params: {
                  projectKeys: this.currentProjectKey,
                  expand: "projects.issuetypes",
                },
              }
            );

            console.error(
              "Project metadata:",
              JSON.stringify(metaResponse.data, null, 2)
            );

            const project = metaResponse.data.projects[0];
            if (!project) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Project ${this.currentProjectKey} not found`
              );
            }

            const issueType = project.issuetypes.find(
              (t: any) => t.name.toLowerCase() === type.toLowerCase()
            );
            if (!issueType) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Issue type "${type}" not found. Available types: ${project.issuetypes
                  .map((t: any) => t.name)
                  .join(", ")}`
              );
            }

            // Use known sprint field ID
            const sprintFieldId = 'customfield_10020';
            console.error("Using sprint field ID:", sprintFieldId);

            const fields: any = {
              project: {
                key: this.currentProjectKey,
              },
              summary,
              description,
              issuetype: {
                name: type
              },
              labels: labels || []
            };

            // Add priority if specified
            if (priority) {
              fields.priority = {
                name: priority
              };
              console.error("Setting priority:", priority);
            }

            // Add story points if specified
            if (story_points !== undefined && this.storyPointsField) {
              fields[this.storyPointsField] = story_points;
              console.error("Setting story points:", story_points);
            }

            // Handle sprint assignment if requested
            if (sprint && sprintFieldId) {
              try {
                const boardId = await this.getBoardId();
                console.error("Found board ID:", boardId);

                // Use a test sprint ID for now
                const sprintId = 1;
                console.error("Using test sprint ID:", sprintId);

                // Validate sprint ID
                if (typeof sprintId !== 'number' || isNaN(sprintId)) {
                  throw new McpError(ErrorCode.InvalidRequest, `Invalid sprint ID: ${sprintId}`);
                }
                
                // Get sprint details
                const sprintsResponse = await this.agileAxiosInstance.get(
                  `/board/${boardId}/sprint`,
                  {
                    params: {
                      state: sprint.toLowerCase() === 'current' ? 'active' : 'active,future'
                    }
                  }
                );

                console.error("Available sprints:", JSON.stringify(sprintsResponse.data, null, 2));

                // Find the requested sprint
                const sprintObj = sprint.toLowerCase() === 'current'
                  ? sprintsResponse.data.values.find((s: any) => s.state === 'active')
                  : sprintsResponse.data.values.find((s: any) => s.name.toLowerCase() === sprint.toLowerCase());

                if (!sprintObj) {
                  throw new McpError(
                    ErrorCode.InvalidRequest,
                    `Sprint "${sprint}" not found. Available sprints: ${sprintsResponse.data.values.map((s: any) => s.name).join(', ')}`
                  );
                }

                // Convert sprint ID to number and validate
                const numericSprintId = Number(sprintObj.id);
                if (isNaN(numericSprintId)) {
                  throw new McpError(ErrorCode.InvalidRequest, `Invalid sprint ID: ${sprintObj.id} is not a number`);
                }

                // Set sprint field with just the numeric ID
                fields[sprintFieldId] = numericSprintId;

                console.error("Setting sprint field:", {
                  fieldId: sprintFieldId,
                  sprintId: numericSprintId,
                  sprintName: sprintObj.name,
                  fieldValue: fields[sprintFieldId]
                });

                // Create issue with sprint field
                const createResponse = await this.axiosInstance.post("/issue", {
                  fields
                });

                return {
                  content: [
                    {
                      type: "text",
                      text: this.formatCreatedIssue(createResponse.data),
                    },
                  ],
                };
              } catch (error) {
                console.error("Error setting sprint:", error);
                throw error;
              }
            }

            if (epic_link) {
              fields.parent = {
                key: epic_link
              };
              console.error("Adding Epic link using parent field:", epic_link);
            }

            const createResponse = await this.axiosInstance.post("/issue", {
              fields,
            });

            return {
              content: [
                {
                  type: "text",
                  text: this.formatCreatedIssue(createResponse.data),
                },
              ],
            };
          }

          case "list_issues": {
            const { status } = args;
            const jql = status
              ? `project = ${this.currentProjectKey} AND status = "${status}" ORDER BY created DESC`
              : `project = ${this.currentProjectKey} ORDER BY created DESC`;

            const searchResponse = await this.axiosInstance.get("/search", {
              params: {
                jql,
                fields: [
                  "summary",
                  "description",
                  "status",
                  "issuetype",
                  "created",
                  "creator",
                ],
              },
            });

            return {
              content: [
                {
                  type: "text",
                  text: this.formatIssueList(searchResponse.data.issues),
                },
              ],
            };
          }

          case "update_issue": {
            const { issue_key, summary, description, status, epic_link, sprint, priority, story_points, labels } = args;
            
            const updateData: any = {
              fields: {},
            };

            if (summary) updateData.fields.summary = summary;
            if (description) updateData.fields.description = description;
            if (priority) {
              updateData.fields.priority = { name: priority };
              console.error("Setting priority:", priority);
            }
            if (story_points !== undefined && this.storyPointsField) {
              updateData.fields[this.storyPointsField] = story_points;
              console.error("Setting story points:", story_points);
            }
            if (labels !== undefined) {
              updateData.fields.labels = labels || [];
              console.error("Setting labels:", labels);
            }
            if (epic_link) {
              updateData.fields.parent = {
                key: epic_link
              };
              console.error("Adding Epic link using parent field:", epic_link);
            }

            // Handle sprint field update
            if (sprint !== undefined) {
              // Get field configuration to find Sprint field ID
              const fieldConfigResponse = await this.axiosInstance.get(
                `/field`,
                {
                  params: {
                    expand: 'names',
                  },
                }
              );

              let sprintFieldId;
              for (const field of fieldConfigResponse.data) {
                if (field.name === 'Sprint') {
                  sprintFieldId = field.id;
                  break;
                }
              }

              if (!sprintFieldId) {
                throw new McpError(ErrorCode.InvalidRequest, 'Sprint field not found');
              }

              if (sprint === '') {
                // Remove from sprint
                updateData.fields[sprintFieldId] = null;
                console.error("Removing issue from sprint");
              } else {
                // Add to specified sprint
                const boardId = await this.getBoardId();
                const sprintsResponse = await this.agileAxiosInstance.get(
                  `/board/${boardId}/sprint`,
                  {
                    params: {
                      state: sprint.toLowerCase() === 'current' ? 'active' : 'active,future'
                    }
                  }
                );

                console.error("Available sprints:", JSON.stringify(sprintsResponse.data, null, 2));

                // Find the requested sprint
                const sprintObj = sprint.toLowerCase() === 'current'
                  ? sprintsResponse.data.values.find((s: any) => s.state === 'active')
                  : sprintsResponse.data.values.find((s: any) => s.name.toLowerCase() === sprint.toLowerCase());

                if (!sprintObj) {
                  throw new McpError(
                    ErrorCode.InvalidRequest,
                    `Sprint "${sprint}" not found. Available sprints: ${sprintsResponse.data.values.map((s: any) => s.name).join(', ')}`
                  );
                }

                // Convert sprint ID to number and validate
                const numericSprintId = Number(sprintObj.id);
                if (isNaN(numericSprintId)) {
                  throw new McpError(ErrorCode.InvalidRequest, `Invalid sprint ID: ${sprintObj.id} is not a number`);
                }

                // Set sprint field with just the numeric ID
                updateData.fields[sprintFieldId] = numericSprintId;
                console.error("Adding issue to sprint:", {
                  fieldId: sprintFieldId,
                  sprintId: numericSprintId,
                  sprintName: sprintObj.name,
                  fieldValue: updateData.fields[sprintFieldId]
                });
              }
            }

            // Handle status transitions
            if (status) {
              console.error(`Fetching transitions for status update to ${status}...`);
              const transitions = await this.axiosInstance.get(
                `/issue/${issue_key}/transitions`
              );
              const transition = transitions.data.transitions.find(
                (t: any) => t.name.toLowerCase() === status.toLowerCase()
              );
              if (transition) {
                console.error(`Applying transition ID ${transition.id}...`);
                await this.axiosInstance.post(
                  `/issue/${issue_key}/transitions`,
                  {
                    transition: { id: transition.id },
                  }
                );
              } else {
                console.error(`No transition found for status: ${status}`);
                console.error(`Available transitions: ${transitions.data.transitions.map((t: any) => t.name).join(', ')}`);
              }
            }

            // Apply updates if there are any
            if (Object.keys(updateData.fields).length > 0) {
              console.error("Applying field updates:", JSON.stringify(updateData, null, 2));
              await this.axiosInstance.put(`/issue/${issue_key}`, updateData);
            } else {
              console.error("No field updates to apply");
            }

            // Fetch updated issue
            console.error("Fetching updated issue...");
            const updatedIssue = await this.axiosInstance.get(
              `/issue/${issue_key}`,
              {
                params: {
                  expand: "renderedFields,names,schema,transitions,operations,editmeta,changelog",
                },
              }
            );
            
            return {
              content: [
                {
                  type: "text",
                  text: this.formatIssue(updatedIssue.data),
                },
              ],
            };
          }

          case "get_issue": {
            const { issue_key } = args;
            
            // Check Story Points field configuration
            await this.checkStoryPointsField();
            
            // Get all available data
            const boardId = await this.getBoardId();
            console.error("Found board ID:", boardId);

            const sprintsResponse = await this.agileAxiosInstance.get(
              `/board/${boardId}/sprint`,
              {
                params: {
                  state: 'active,closed,future'
                }
              }
            );

            const issueResponse = await this.axiosInstance.get(`/issue/${issue_key}`, {
              params: {
                expand: "renderedFields,names,schema,editmeta",
                fields: "*all"
              }
            });

            // Return both standard issue info and debug info
            return {
              content: [
                {
                  type: "text",
                  text: `Debug Information:
Available Sprints: ${JSON.stringify(sprintsResponse.data, null, 2)}

Issue Fields: ${JSON.stringify(issueResponse.data.fields, null, 2)}

Standard Issue Info:
${this.formatIssue(issueResponse.data)}`
                }
              ]
            };
          }

          case "delete_issue": {
            const { issue_key } = args;
            await this.axiosInstance.delete(`/issue/${issue_key}`);
            return {
              content: [
                {
                  type: "text",
                  text: `Issue ${issue_key} has been deleted.`,
                },
              ],
            };
          }

          case "add_comment": {
            const { issue_key, comment } = args;
            await this.axiosInstance.post(`/issue/${issue_key}/comment`, {
              body: comment,
            });
            return {
              content: [
                {
                  type: "text",
                  text: `Comment added to issue ${issue_key}`,
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error("Jira API Error:", {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
          });
          throw new McpError(
            ErrorCode.InternalError,
            `Jira API error: ${JSON.stringify(
              error.response?.data ?? error.message
            )}`
          );
        }
        throw error;
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Jira MCP server running on stdio");
  }
}

const server = new JiraServer();
server.run().catch(console.error);
