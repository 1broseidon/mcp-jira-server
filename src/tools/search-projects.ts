/**
 * Search for projects with filtering capabilities
 */
import { AxiosInstance } from "axios";

export async function handleSearchProjects(
  axiosInstance: AxiosInstance,
  args: any
) {
  try {
    const params: any = {};
    
    // Add search parameters
    if (args.query) {
      params.query = args.query;
    }
    if (args.typeKey) {
      params.typeKey = args.typeKey;
    }
    if (args.categoryId) {
      params.categoryId = args.categoryId;
    }
    if (args.action) {
      params.action = args.action;
    }
    if (args.expand) {
      params.expand = args.expand;
    }
    if (args.status) {
      params.status = args.status;
    }
    if (args.properties) {
      params.properties = args.properties;
    }
    if (args.propertyQuery) {
      params.propertyQuery = args.propertyQuery;
    }

    // Pagination
    params.startAt = args.startAt || 0;
    params.maxResults = args.maxResults || 50;

    const response = await axiosInstance.get(
      `/rest/api/3/project/search`,
      { params }
    );

    const data = response.data;
    const projects = data.values || [];

    // Format projects with useful information
    const formattedProjects = projects.map((project: any) => ({
      id: project.id,
      key: project.key,
      name: project.name,
      description: project.description || "No description",
      projectTypeKey: project.projectTypeKey,
      projectCategory: project.projectCategory?.name || "No category",
      lead: project.lead?.displayName || "No lead",
      leadAccountId: project.lead?.accountId || null,
      url: project.url || "No URL",
      email: project.email || "No email",
      assigneeType: project.assigneeType || "UNASSIGNED",
      avatarUrls: project.avatarUrls,
      components: project.components?.length || 0,
      versions: project.versions?.length || 0,
      roles: project.roles ? Object.keys(project.roles).length : 0,
      insight: project.insight || null,
      deleted: project.deleted || false,
      retentionTillDate: project.retentionTillDate || null,
      deletedDate: project.deletedDate || null,
      deletedBy: project.deletedBy || null,
      archived: project.archived || false,
      archivedDate: project.archivedDate || null,
      archivedBy: project.archivedBy || null
    }));

    // Separate into categories
    const activeProjects = formattedProjects.filter((p: any) => !p.deleted && !p.archived);
    const archivedProjects = formattedProjects.filter((p: any) => p.archived);
    const deletedProjects = formattedProjects.filter((p: any) => p.deleted);

    return {
      content: [
        {
          type: "text",
          text: `# Project Search Results

## 📊 Search Summary
- **Query**: ${args.query || "All projects"}
- **Total Found**: ${data.total || formattedProjects.length}
- **Showing**: ${formattedProjects.length} projects
- **Active**: ${activeProjects.length}
- **Archived**: ${archivedProjects.length}
- **Deleted**: ${deletedProjects.length}

## 🚀 Active Projects (${activeProjects.length})
${activeProjects.length > 0 ? 
  activeProjects.map((project: any) => 
    `### ${project.name} (${project.key})
- **ID**: ${project.id}
- **Description**: ${project.description}
- **Type**: ${project.projectTypeKey}
- **Category**: ${project.projectCategory}
- **Lead**: ${project.lead}
- **Components**: ${project.components}
- **Versions**: ${project.versions}
- **Roles**: ${project.roles}`
  ).join('\n\n') : 
  "No active projects found."
}

${archivedProjects.length > 0 ? `
## 📦 Archived Projects (${archivedProjects.length})
${archivedProjects.slice(0, 5).map((project: any) => 
  `- **${project.name}** (${project.key}) - Archived: ${project.archivedDate || "Unknown"}`
).join('\n')}${archivedProjects.length > 5 ? `\n... and ${archivedProjects.length - 5} more` : ""}
` : ""}

${deletedProjects.length > 0 ? `
## 🗑️ Deleted Projects (${deletedProjects.length})
${deletedProjects.slice(0, 3).map((project: any) => 
  `- **${project.name}** (${project.key}) - Deleted: ${project.deletedDate || "Unknown"}`
).join('\n')}${deletedProjects.length > 3 ? `\n... and ${deletedProjects.length - 3} more` : ""}
` : ""}

## 🔍 Search Tips
- Use \`query\` parameter to search by name or key
- Filter by \`typeKey\` (software, service_desk, business)
- Use \`status\` parameter (live, archived, deleted)
- Add \`expand\` parameter for more details (description, lead, url, projectKeys, insight)`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error searching projects: ${error.response?.data?.errorMessages?.join(", ") || error.message}`,
        },
      ],
      isError: true,
    };
  }
}