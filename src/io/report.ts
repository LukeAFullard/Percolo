export interface ReportData {
  projectName?: string;
  totalDocuments: number;
  topics: Array<{
    id: number;
    name: string; // Top 3 words joined
    size: number;
    words: Array<{ word: string; score: number }>;
    summary?: string;
  }>;
  executionTimeMs?: number;
}

export class ReportGenerator {
  /**
   * Generates a structured Markdown report from the pipeline results.
   */
  static generateMarkdown(data: ReportData): string {
    let md = `# Topic Modeling Analysis Report\n\n`;

    if (data.projectName) {
      md += `**Project:** ${data.projectName}\n`;
    }
    md += `**Total Documents Processed:** ${data.totalDocuments}\n`;
    md += `**Total Topics Discovered:** ${data.topics.length}\n`;

    if (data.executionTimeMs) {
      md += `**Execution Time:** ${(data.executionTimeMs / 1000).toFixed(2)} seconds\n`;
    }

    md += `\n---\n\n## Discovered Topics\n\n`;

    // Sort topics by size descending, but keep noise (-1) at the end if it exists
    const sortedTopics = [...data.topics].sort((a, b) => {
        if (a.id === -1) return 1;
        if (b.id === -1) return -1;
        return b.size - a.size;
    });

    for (const topic of sortedTopics) {
      const isNoise = topic.id === -1;
      const title = isNoise ? `Topic -1: Outlier / Noise` : `Topic ${topic.id}: ${topic.name}`;

      md += `### ${title}\n`;
      md += `- **Document Count:** ${topic.size} (${((topic.size / data.totalDocuments) * 100).toFixed(1)}% of corpus)\n`;

      if (topic.summary) {
          md += `- **Summary:** ${topic.summary}\n`;
      }

      md += `- **Top Keywords (c-TF-IDF):**\n`;
      for (const w of topic.words.slice(0, 10)) {
          md += `  - ${w.word} (${w.score.toFixed(4)})\n`;
      }
      md += `\n`;
    }

    return md;
  }

  /**
   * Generates a self-contained HTML report.
   */
  static generateHTML(data: ReportData): string {
    const markdown = this.generateMarkdown(data);

    // Very simple Markdown to HTML conversion for the specific structure we generated
    let htmlContent = markdown
        .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold text-slate-800 mb-6">$1</h1>')
        .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-semibold text-slate-700 mt-8 mb-4 border-b pb-2">$1</h2>')
        .replace(/^### (.*$)/gim, '<h3 class="text-xl font-medium text-slate-800 mt-6 mb-2">$1</h3>')
        .replace(/^\*\*([^]*?)\*\*(.*)/gim, '<strong>$1</strong>$2<br>')
        .replace(/^- \*\*([^]*?)\*\* (.*)/gim, '<li class="mb-1"><strong>$1</strong> $2</li>')
        .replace(/^- \*\*([^]*?)\*\*$/gim, '<p class="font-medium mt-2">$1</p><ul class="list-disc pl-5 mb-4">')
        .replace(/^  - (.*)/gim, '<li>$1</li>')
        .replace(/---/gim, '<hr class="my-8 border-slate-200">')
        .replace(/\n\n/gim, '</p><p class="mb-4">')
        .replace(/<\/ul><\/p><p class="mb-4">/gim, '</ul>')
        .replace(/<\/p><p class="mb-4"><li/gim, '<li');

    // Wrap in standard HTML5 boilerplate with Tailwind via CDN for styling
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Percolo Analysis Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; }
    </style>
</head>
<body class="bg-slate-50 text-slate-600 p-8">
    <div class="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        ${htmlContent}
    </div>
</body>
</html>`;
  }
}
