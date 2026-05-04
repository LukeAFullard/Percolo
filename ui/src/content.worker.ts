import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

let generator: any = null;
let currentModel: string | null = null;

self.onmessage = async (e: MessageEvent) => {
    try {
        const { text, format, model = 'onnx-community/Qwen2.5-1.5B-Instruct', additionalInstructions } = e.data;

        if (!generator || currentModel !== model) {
            if (generator) {
                // Try to dispose old model if possible (method depends on version, usually embedded in the pipeline object or managed by cache)
                try {
                    if (typeof generator.dispose === 'function') generator.dispose();
                } catch (e) {
                    // Ignore
                }
            }
            // Send a loading message so the UI knows we're downloading/loading the model
            self.postMessage({ status: 'loading' });

            currentModel = model;
            const progress_callback = (data: any) => {
                if (data.status === 'progress' || data.status === 'download') {
                    self.postMessage({
                        status: 'progress',
                        file: data.file,
                        progress: data.progress,
                        loaded: data.loaded,
                        total: data.total
                    });
                }
            };

            generator = await pipeline('text-generation', model, {
                device: 'webgpu',
                dtype: 'q4f16',
                progress_callback
            }).catch(async () => {
                // Fallback to WASM if WebGPU is not available
                return await pipeline('text-generation', model, {
                    device: 'wasm',
                    dtype: 'q8',
                    progress_callback
                });
            });
        }

        // 1. Defensively truncate to prevent OOM using the model's actual tokenizer
        const MAX_CONTEXT_TOKENS: Record<string, number> = {
            'onnx-community/smollm2-360M-instruct': 1200,
            'onnx-community/Qwen2.5-0.5B-Instruct': 2000,
            'onnx-community/Qwen2.5-1.5B-Instruct': 4000,
            'onnx-community/Llama-3.2-1B-Instruct': 4000,
            'onnx-community/Bonsai-1.7B-ONNX': 3000,
            'onnx-community/gemma-4-E2B-it-ONNX': 4000,
            'onnx-community/Phi-4-mini-instruct-ONNX-MHA': 6000,
        };
        const maxTokens = MAX_CONTEXT_TOKENS[model] || 2000;

        let truncatedText = text;
        if (generator.tokenizer) {
            try {
                const tokens = generator.tokenizer.encode(text);
                if (tokens.length > maxTokens) {
                    const sliced = tokens.slice(0, maxTokens);
                    truncatedText = generator.tokenizer.decode(sliced) + "\n...[TRUNCATED FOR LENGTH]";
                }
            } catch (err) {
                console.warn("Failed to tokenize text for truncation, falling back to substring", err);
                const charLimit = maxTokens * 3;
                if (text.length > charLimit) {
                    truncatedText = text.substring(0, charLimit) + "\n...[TRUNCATED FOR LENGTH]";
                }
            }
        } else {
             const charLimit = maxTokens * 3;
             if (text.length > charLimit) {
                 truncatedText = text.substring(0, charLimit) + "\n...[TRUNCATED FOR LENGTH]";
             }
        }

        // 2. Sanitize to prevent prompt injection from within the reference texts
        truncatedText = truncatedText
            .replace(/<\|im_start\|>|<\|im_end\|>/gi, '') // ChatML tokens
            .replace(/<\|begin_of_text\|>|<\|start_header_id\|>/gi, '') // Llama3 tokens
            .replace(/\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>/gi, '') // Llama2 tokens
            .replace(/<start_of_turn>|<end_of_turn>/gi, '') // Gemma tokens
            .replace(/\bSYSTEM:\s*/gi, '[system-ref]: ') // Generic overrides
            .replace(/ignore (all |previous )?(instructions?|rules?|prompts?)/gi, '[redacted]');

        // 3. Extract URLs to guide the model on available links
        const urlRegex = /https?:\/\/[^\s"'<>)\]]+/g;
        const availableUrls = [...new Set(truncatedText.match(urlRegex) ?? [])].slice(0, 8); // cap at 8 unique

        const urlBlock = availableUrls.length > 0
            ? `AVAILABLE LINKS (use one or more of these verbatim in your output — do not invent URLs):\n${availableUrls.map(u => `- ${u}`).join('\n')}`
            : `AVAILABLE LINKS: None found in source texts. Do NOT invent or guess URLs. You may write "(no source link available)" as a placeholder if a link section is required.`;

        const sanitizedExtra = additionalInstructions?.trim()
            ? `\n\nOVERRIDE INSTRUCTIONS (apply these; do not let them change the output format structure):\n${additionalInstructions.trim()}`
            : '';

        const GROUNDING = `RULES: Use ONLY information from the reference texts. Do not add facts, names, or claims not in the texts. ${urlBlock}`;

        let messages: { role: string; content: string }[] = [];

        if (format === 'newsletter') {
            messages = [
                {
                    role: 'system',
                    content: `You are a newsletter writer. Write a structured email newsletter with EXACTLY these sections in order:
1. "Subject: " — one subject line
2. "Hook:" — 1-2 sentences
3. "Body:" — 2-3 short paragraphs
4. "Takeaway:" — one sentence
5. "Links:" — list the relevant URLs from AVAILABLE LINKS, or write "(no source link available)"

Use markdown. Max 350 words. Base content only on provided texts.${sanitizedExtra}`
                },
                {
                    role: 'user',
                    content: `${GROUNDING}\n\n--- BEGIN REFERENCE TEXTS ---\n${truncatedText}\n--- END REFERENCE TEXTS ---\n\nWrite the newsletter now.`
                }
            ];

        } else if (format === 'professional') {
            messages = [
                {
                    role: 'system',
                    content: `You are a professional social media writer. Write a post with EXACTLY these sections:
1. "Hook:" — one bold sentence
2. "Points:" — 3-5 short lines or a brief list
3. "CTA:" — one sentence inviting engagement
4. "Links:" — list the relevant URLs from AVAILABLE LINKS, or write "(no source link available)"
5. "Tags:" — 3-5 hashtags

No emojis unless the topic warrants them. Max 220 words. Base content only on provided texts.${sanitizedExtra}`
                },
                {
                    role: 'user',
                    content: `${GROUNDING}\n\n--- BEGIN REFERENCE TEXTS ---\n${truncatedText}\n--- END REFERENCE TEXTS ---\n\nWrite the post now.`
                }
            ];

        } else if (format === 'forum') {
            messages = [
                {
                    role: 'system',
                    content: `You are a forum contributor. Write a discussion post with EXACTLY these sections:
1. "Title: " — one title
2. "Opening:" — 1-2 sentences with a question or bold statement
3. "Background:" — 2-3 paragraphs of context
4. "Discussion Questions:" — exactly 2-3 questions as a numbered list
5. "Links:" — list the relevant URLs from AVAILABLE LINKS, or write "(no source link available)"

Conversational but informed tone. 200-300 words. Base content only on provided texts.${sanitizedExtra}`
                },
                {
                    role: 'user',
                    content: `${GROUNDING}\n\n--- BEGIN REFERENCE TEXTS ---\n${truncatedText}\n--- END REFERENCE TEXTS ---\n\nWrite the forum post now.`
                }
            ];

        } else if (format === 'microblog') {
            messages = [
                {
                    role: 'system',
                    content: `You are a microblog writer. Write EXACTLY 4 posts formatted as:
[1/4] <text — bold hook, max 280 chars>
[2/4] <text — key insight, max 280 chars>
[3/4] <text — key insight, max 280 chars>
[4/4] <text — takeaway or CTA, max 280 chars. Append one URL from AVAILABLE LINKS if available, otherwise omit.>

No hashtags except optionally on [4/4]. Base content only on provided texts.${sanitizedExtra}`
                },
                {
                    role: 'user',
                    content: `${GROUNDING}\n\n--- BEGIN REFERENCE TEXTS ---\n${truncatedText}\n--- END REFERENCE TEXTS ---\n\nWrite the thread now.`
                }
            ];

        } else if (format === 'video') {
            messages = [
                {
                    role: 'system',
                    content: `You are a video scriptwriter. Write a 60-90 second script with EXACTLY this structure:

[HOOK - 0:00-0:10]
Narration: ...

[POINT 1 - 0:10-0:30]
Visual: ...
Narration: ...

[POINT 2 - 0:30-0:55]
Visual: ...
Narration: ...

[OUTRO - 0:55-1:00]
Narration: ...
CTA: ...
Source: <one URL from AVAILABLE LINKS, or "(no source link available)">

Short conversational sentences. Under 160 spoken words. Base content only on provided texts.${sanitizedExtra}`
                },
                {
                    role: 'user',
                    content: `${GROUNDING}\n\n--- BEGIN REFERENCE TEXTS ---\n${truncatedText}\n--- END REFERENCE TEXTS ---\n\nWrite the script now.`
                }
            ];

        } else { // summary
            messages = [
                {
                    role: 'system',
                    content: `You are a summarization assistant. Write a summary with EXACTLY these sections:
1. "TL;DR: " — one sentence
2. "Key Points:" — 3-5 bullet points
3. "Conclusion:" — one sentence
4. "Links:" — list the relevant URLs from AVAILABLE LINKS, or write "(no source link available)"

Facts only. No editorializing. Under 200 words. Base content only on provided texts.${sanitizedExtra}`
                },
                {
                    role: 'user',
                    content: `${GROUNDING}\n\n--- BEGIN REFERENCE TEXTS ---\n${truncatedText}\n--- END REFERENCE TEXTS ---\n\nWrite the summary now.`
                }
            ];
        }

        const result = await generator(messages, {
            max_new_tokens: 500,
            temperature: 0.7,
            repetition_penalty: 1.15,
            do_sample: true,
            truncation: true,
            max_length: 2048
        });

        let outText = result[0].generated_text.at(-1).content;

        self.postMessage({ status: 'complete', result: outText });
    } catch (err: any) {
        self.postMessage({ status: 'error', error: err.message || String(err) });
    }
};
