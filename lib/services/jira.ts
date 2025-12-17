export interface JiraTicket {
  key: string;
  fields: {
    summary: string;
    description: string | any | null;
    status: {
      name: string;
    };
    comment?: {
      comments: {
        body: string | any;
        author: { displayName: string };
        created: string;
      }[];
    };
  };
}

export class JiraService {
  private host: string;
  private email: string;
  private token: string;

  constructor() {
    this.host = process.env.JIRA_HOST || '';
    this.email = process.env.JIRA_EMAIL || '';
    this.token = process.env.JIRA_API_TOKEN || '';

    if (!this.host || !this.email || !this.token) {
      throw new Error('Missing Jira credentials in .env');
    }
  }

  private getAuthHeader(): string {
    return Buffer.from(`${this.email}:${this.token}`).toString('base64');
  }

  public async searchTickets(jql: string, fields: string[] = ['summary', 'description', 'status'], maxResults = 20): Promise<JiraTicket[]> {
    const url = `${this.host}/rest/api/3/search/jql`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.getAuthHeader()}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jql,
        fields,
        maxResults,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.issues as JiraTicket[];
  }

  public extractTextFromADF(node: any): string {
    if (!node) return '';
    if (typeof node === 'string') return node;

    if (node.type === 'text') return node.text || '';

    if (node.content && Array.isArray(node.content)) {
      return node.content
        .map((child: any) => this.extractTextFromADF(child))
        .join('');
    }

    return '';
  }

  public parseDescription(description: any): string {
    if (!description) return '(No description provided)';
    if (typeof description === 'string') return description;

    try {
      if (description.content && Array.isArray(description.content)) {
        return description.content
          .map((p: any) => this.extractTextFromADF(p))
          .join('\n');
      }
      return JSON.stringify(description);
    } catch (e) {
      return '(Could not parse description)';
    }
  }
}

