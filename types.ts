export type ProjectFile = { path: string; content: string; language?: string };
export type ChatMessage = { role: 'user' | 'assistant'; content: string; at: number };
export type StudioProject = { id: string; name: string; files: ProjectFile[]; messages: ChatMessage[]; updatedAt: number };
