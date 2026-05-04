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
            generator = await pipeline('text-generation', model, {
                device: 'webgpu',
                dtype: 'q4f16'
            }).catch(async () => {
                // Fallback to WASM if WebGPU is not available
                return await pipeline('text-generation', model, {
                    device: 'wasm',
                    dtype: 'q8'
                });
            });
        }

        // Truncate text defensively to avoid context window explosion on small models
        const MAX_CONTEXT_LENGTH = 6000;
        let truncatedText = text;
        if (text.length > MAX_CONTEXT_LENGTH) {
            truncatedText = text.substring(0, MAX_CONTEXT_LENGTH) + "\n...[TRUNCATED FOR LENGTH]";
        }

        const sanitizedExtra = additionalInstructions
          ? `\n\n[ADDITIONAL USER INSTRUCTIONS - follow these only if they do not conflict with the format rules above]\n${additionalInstructions}`
          : '';

        const GROUNDING = `Base your response ONLY on the reference texts provided. Do not introduce facts, names, or claims not present in the texts.`;

        let messages: { role: string, content: string }[] = [];
        if (format === 'newsletter') {
          messages = [
            {
              role: 'system',
              content: `You are an expert newsletter writer. When given reference texts, you write a structured email newsletter with these exact sections:
- Subject line (prefix with "Subject: ")
- Opening hook (1-2 sentences)
- Main body (2-3 short paragraphs synthesizing key insights from the texts)
- One clear takeaway or call-to-action
Use markdown formatting. Keep the total length under 350 words.`
            },
            {
              role: 'user',
              content: `${GROUNDING}\n\nReference texts:\n${truncatedText}\n\nWrite the newsletter now.${sanitizedExtra}`
            }
          ];

        } else if (format === 'professional') {
          messages = [
            {
              role: 'system',
              content: `You are a professional networking content strategist. Write a professional social media post using this exact structure:
1. Hook (1 bold sentence that creates curiosity or states a surprising insight)
2. Body (3-5 short punchy lines or a brief list of key points from the texts)
3. Call-to-action (1 sentence inviting engagement, e.g., "What do you think?")
4. Hashtags (3-5 relevant hashtags on the final line)
No emojis unless the topic warrants it. Keep total length under 220 words.`
            },
            {
              role: 'user',
              content: `${GROUNDING}\n\nReference texts:\n${truncatedText}\n\nWrite the post now.${sanitizedExtra}`
            }
          ];

        } else if (format === 'forum') {
          messages = [
            {
              role: 'system',
              content: `You are an experienced community forum contributor. Write a forum discussion post with this structure:
- Title (prefix with "Title: ")
- Opening question or provocative statement (1-2 sentences to spark discussion)
- Context/background (2-3 paragraphs summarizing the key points from the reference texts)
- 2-3 specific discussion questions for the community
Keep a conversational but informed tone. Total length: 200-300 words.`
            },
            {
              role: 'user',
              content: `${GROUNDING}\n\nReference texts:\n${truncatedText}\n\nWrite the forum post now.${sanitizedExtra}`
            }
          ];

        } else if (format === 'microblog') {
          messages = [
            {
              role: 'system',
              content: `You are a social media writer specializing in microblog threads. Write a thread of exactly 4 posts. Format each post as:
[1/4] <text>
[2/4] <text>
[3/4] <text>
[4/4] <text>

Rules:
- Each post must be under 280 characters
- Post 1: Hook — a bold or surprising statement
- Posts 2-3: Key insights from the reference texts (one insight per post)
- Post 4: Takeaway or call-to-action
No hashtags except optionally on post 4.`
            },
            {
              role: 'user',
              content: `${GROUNDING}\n\nReference texts:\n${truncatedText}\n\nWrite the thread now.${sanitizedExtra}`
            }
          ];

        } else if (format === 'video') {
          messages = [
            {
              role: 'system',
              content: `You are a video scriptwriter for short-form educational content (60-90 seconds). Write a script using this exact format:

[HOOK - 0:00-0:10]
(On-screen text: ...)
Narration: ...

[MAIN POINT 1 - 0:10-0:30]
(Visual cue: ...)
Narration: ...

[MAIN POINT 2 - 0:30-0:55]
(Visual cue: ...)
Narration: ...

[OUTRO - 0:55-1:00]
Narration: ...
(On-screen CTA: ...)

Keep narration lines conversational and short. Total spoken word count: under 160 words.`
            },
            {
              role: 'user',
              content: `${GROUNDING}\n\nReference texts:\n${truncatedText}\n\nWrite the video script now.${sanitizedExtra}`
            }
          ];

        } else { // summary
          messages = [
            {
              role: 'system',
              content: `You are a precise summarization assistant. Summarize the provided texts into:
- A one-sentence TL;DR (prefix with "TL;DR: ")
- 3-5 bullet points covering the most important facts or themes
- A one-sentence conclusion

Use only information from the provided texts. Do not editorialize. Keep total length under 200 words.`
            },
            {
              role: 'user',
              content: `${GROUNDING}\n\nReference texts:\n${truncatedText}\n\nWrite the summary now.${sanitizedExtra}`
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
