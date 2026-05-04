import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

let generator: any = null;
let currentModel: string | null = null;

self.onmessage = async (e: MessageEvent) => {
    try {
        const { text, format, model = 'Xenova/Qwen1.5-0.5B-Chat', additionalInstructions } = e.data;

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

        const extraPrompt = additionalInstructions ? `\n\nAdditional Instructions from user:\n${additionalInstructions}` : '';

        let messages: { role: string, content: string }[] = [];
        if (format === 'newsletter') {
            messages = [
                { role: 'system', content: 'You are a helpful assistant that writes engaging newsletters.' },
                { role: 'user', content: `Write an engaging email newsletter about the following topic using these reference texts:\n\n${text}${extraPrompt}` }
            ];
        } else if (format === 'professional') {
            messages = [
                { role: 'system', content: 'You are a helpful assistant that writes professional networking posts.' },
                { role: 'user', content: `Write a professional social media post about the following topic, include hashtags, using these reference texts:\n\n${text}${extraPrompt}` }
            ];
        } else if (format === 'forum') {
             messages = [
                { role: 'system', content: 'You are a helpful assistant that writes engaging community forum posts.' },
                { role: 'user', content: `Write an engaging community discussion post about the following topic using these reference texts:\n\n${text}${extraPrompt}` }
            ];
        } else if (format === 'microblog') {
             messages = [
                { role: 'system', content: 'You are a helpful assistant that writes engaging microblog threads.' },
                { role: 'user', content: `Write a short, engaging microblog thread about the following topic using these reference texts:\n\n${text}${extraPrompt}` }
            ];
        } else if (format === 'video') {
             messages = [
                { role: 'system', content: 'You are a helpful assistant that writes video scripts.' },
                { role: 'user', content: `Write a short video script about the following topic using these reference texts:\n\n${text}${extraPrompt}` }
            ];
        } else {
             messages = [
                { role: 'system', content: 'You are a helpful assistant that summarizes text.' },
                { role: 'user', content: `Summarize the following topic using these reference texts:\n\n${text}${extraPrompt}` }
            ];
        }

        const result = await generator(messages, {
            max_new_tokens: 500,
            temperature: 0.7,
            repetition_penalty: 1.2,
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
