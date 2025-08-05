import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

# We are now only importing the metric calculation functions
from .evaluation_metrics import (
    calculate_reading_ease,
    calculate_lexical_diversity,
    count_action_verbs,
    count_constraints,
    get_prompt_length_score
)

load_dotenv(dotenv_path='.env')
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

def run_metric_based_evaluation(user_prompt):
    """
    Runs a comprehensive evaluation based on multiple metrics.
    This function no longer contains any caching logic.
    """
    if not user_prompt:
        return {"error": "Prompt cannot be empty."}

    # --- 1. Calculate Individual Metrics ---
    reading_ease = calculate_reading_ease(user_prompt)
    lexical_diversity = calculate_lexical_diversity(user_prompt)
    action_verbs = count_action_verbs(user_prompt)
    constraints = count_constraints(user_prompt)
    length_score = get_prompt_length_score(user_prompt)

    # --- 2. Define Scoring Logic ---
    score_breakdown = {
        "Clarity (Reading Ease > 60)": 20 if reading_ease > 60 else int(max(0, reading_ease / 3)),
        "Vocabulary (Lexical Diversity > 0.8)": 20 if lexical_diversity > 0.8 else int(lexical_diversity * 25),
        "Actionability (Has Action Verbs)": 25 if action_verbs > 0 else 0,
        "Specificity (Has Constraints)": 25 if constraints > 0 else 0,
        "Brevity (Optimal Length)": 10 if length_score > 5 else 0
    }

    # --- 3. Calculate Final Score & Provide Feedback ---
    final_score = sum(score_breakdown.values())

    feedback = []
    if score_breakdown["Clarity (Reading Ease > 60)"] < 15:
        feedback.append("The prompt is complex and may be hard for the AI to parse. Try simplifying the language.")
    if score_breakdown["Vocabulary (Lexical Diversity > 0.8)"] < 15:
        feedback.append("The vocabulary is repetitive. Using more diverse words can add descriptive power.")
    if score_breakdown["Actionability (Has Action Verbs)"] == 0:
        feedback.append("The prompt lacks a clear action verb (e.g., 'summarize', 'generate'). State the goal directly.")
    if score_breakdown["Specificity (Has Constraints)"] == 0:
        feedback.append("The prompt could be more specific. Add constraints like 'in the style of...' or 'format as a list'.")

    final_result = {
        "final_score": final_score,
        "breakdown": score_breakdown,
        "feedback": " ".join(feedback) or "This is a well-structured prompt!"
    }

    # The result is returned directly. This function is fast and does not need to stream.
    return {"evaluation": json.dumps(final_result)}


def refine_prompt_with_llm(original_prompt, score, feedback):
    """
    Uses an LLM to refine a user's prompt based on the metric-based feedback.
    """
    print(f"Refining prompt with score: {score} and feedback: {feedback}")

    # This is the "meta-prompt" - a prompt for the AI about another prompt.
    # It's engineered to be very specific about the task.
    refinement_prompt = f"""
    You are an expert prompt engineer. Your task is to rewrite and improve a user's prompt based on an automated evaluation it received.

    The user's original prompt was:
    ---
    {original_prompt}
    ---

    It received a score of {score}/100, with the following feedback:
    ---
    {feedback}
    ---

    Instructions:
    1.  Carefully read the original prompt and the feedback.
    2.  Rewrite the prompt to address the feedback. For example, if the feedback mentions a lack of action verbs or constraints, add them.
    3.  The new prompt should be clear, specific, and follow best practices.
    4.  Do NOT add any commentary or explanation.
    5.  Return ONLY the refined prompt text.

    Refined Prompt:
    """

    try:
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        response = model.generate_content(refinement_prompt)
        # We add a .strip() to remove any leading/trailing whitespace
        return {"refined_prompt": response.text.strip()}
    except Exception as e:
        print(f"An error occurred during prompt refinement: {e}")
        return {"error": "Failed to get a response from the Gemini API during refinement."}