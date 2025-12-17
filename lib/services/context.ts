export type QuestContext = Record<string, string>;

export class ContextService {
  private context: QuestContext;

  constructor(initialContext: QuestContext = {}) {
    this.context = initialContext;
  }

  public generateDefaults(): void {
    const date = new Date();
    const shortMonth = date
      .toLocaleString('default', { month: 'short' })
      .toLowerCase();
    const day = date.getDate();
    const shortDate = `${shortMonth}${day}`;
    const randomNum = Math.floor(Math.random() * 900000) + 100000;

    this.context.dynamicEmail = `jordan.mcinnis+${shortDate}${randomNum}@hellofresh.ca`;
  }

  public getContext(): QuestContext {
    return this.context;
  }

  public applySubstitutions(params: any): any {
    if (!this.context) return params;
    const newParams = { ...params };

    for (const [key, value] of Object.entries(this.context)) {
      const placeholder = `{{${key}}}`;
      for (const paramKey in newParams) {
        if (
          typeof newParams[paramKey] === 'string' &&
          newParams[paramKey].includes(placeholder)
        ) {
          newParams[paramKey] = newParams[paramKey].replace(placeholder, value);
        }
      }
    }
    return newParams;
  }

  public reverseSubstitutions(params: any): any {
    if (!this.context) return params;
    const newParams = { ...params };

    for (const [key, value] of Object.entries(this.context)) {
      const placeholder = `{{${key}}}`;
      for (const paramKey in newParams) {
        if (
          typeof newParams[paramKey] === 'string' &&
          newParams[paramKey].includes(value)
        ) {
          newParams[paramKey] = newParams[paramKey].replace(value, placeholder);
        }
      }
    }
    return newParams;
  }
}
