import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv(dotenv_path='.env')
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))


GAUNTLETS = {
    "clarity-check": {
        "name": "Clarity Check",
        "description": "This gauntlet evaluates your prompt for basic clarity and specificity. A good prompt is unambiguous and provides enough context for the AI.",
        "system_prompt": """
            As an expert in prompt engineering, evaluate the following user's prompt based on its clarity and specificity.
            Provide a score from 1 to 10 (1=very vague, 10=very clear) and a short, one-sentence justification for your score.
            Return your response ONLY as a JSON object with two keys: "score" and "justification".
        """
    },
    "few-shot-example": {
        "name": "Few-Shot Learner",
        "description": "This gauntlet tests your ability to provide examples (shots) to guide the AI's output format. Provide at least two examples in your prompt.",
        "system_prompt": """
            As an expert in few-shot prompting, evaluate if the user's prompt effectively uses at least two examples to guide the AI.
            Provide a score from 1 to 10 (1=no examples, 10=excellent examples) and a short justification.
            Return your response ONLY as a JSON object with two keys: "score" and "justification".
        """
    }
    # You can add more gauntlets here in the future
}

def run_gauntlet_evaluation(gauntlet_id, user_prompt):
    # if gauntlet_id not in GAUNTLETS:
    #     return {"error": "Invalid gauntlet ID."}
    # if not user_prompt:
    #     return {"error": "Prompt cannot be empty."}
    #
    # gauntlet = GAUNTLETS[gauntlet_id]
    # evaluator_prompt = f"""
    # {gauntlet['system_prompt']}.
    #
    # User's Prompt: "{user_prompt}"
    # """
    #
    # try:
    #     model = genai.GenerativeModel('gemini-1.5-flash-latest')
    #     response = model.generate_content(evaluator_prompt)
    #     return {"evaluation": response.text}
    # except Exception as e:
    #     print(f"An error occurred during API call: {e}")
    #     return {"error": "Failed to get a response from the Gemini API."}
    """
        This function calls the Gemini API with stream=True and yields each chunk.
        This is a "generator" function.
        """
    if gauntlet_id not in GAUNTLETS:
        yield "data: {\"error\": \"Invalid gauntlet ID.\"}\n\n"
        return

    gauntlet = GAUNTLETS[gauntlet_id]
    evaluator_prompt = f"""
        {gauntlet['system_prompt']}

        User's Prompt: "{user_prompt}"
        """

    try:
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        # The key change: stream=True
        responses = model.generate_content(evaluator_prompt, stream=True)

        # Yield each chunk of the response as it comes in
        for response in responses:
            # We wrap the chunk in a "data: ...\n\n" format for Server-Sent Events
            yield f"data: {response.text}\n\n"

    except Exception as e:
        print(f"An error occurred during API stream: {e}")
        yield f"data: {{\"error\": \"Failed to stream response from Gemini API.\"}}\n\n"