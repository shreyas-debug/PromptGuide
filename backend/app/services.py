import csv
import os
import json
from datetime import datetime

import google.generativeai as genai
from dotenv import load_dotenv
from groq import Groq
from nltk import word_tokenize
from sentence_transformers import SentenceTransformer, util
from textstat import textstat

from .evaluation_metrics import (
    calculate_reading_ease,
    calculate_lexical_diversity,
    count_action_verbs,
    count_constraints,
    get_prompt_length_score
)

load_dotenv(dotenv_path='.env')
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
print("Loading embedding model for semantic similarity...")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
print("Embedding model loaded.")

# --- Gauntlets as Refinement Goals ---
GAUNTLETS = {
    "improve-clarity": {
        "name": "Improve Clarity & Specificity",
        "instruction": "Focus on making the prompt's language simpler, clearer, and more direct. Add specific details and constraints if they are missing."
    },
    "add-chain-of-thought": {
        "name": "Add Chain-of-Thought",
        "instruction": "Modify the prompt to include a chain-of-thought or a step-by-step reasoning process that guides the AI."
    },
    "convert-to-few-shot": {
        "name": "Convert to Few-Shot",
        "instruction": "Rewrite the prompt to include at least two clear examples (shots) that demonstrate the desired output format."
    }
}

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
    return final_result


def log_statistical_results(original_prompt, refined_prompt, original_score, refined_score):
    filepath = 'statistical_results.csv'
    headers = [
        'timestamp', 'original_prompt', 'refined_prompt',
        'original_score', 'refined_score',
        'semantic_similarity'
    ]

    embedding_original = embedding_model.encode(original_prompt)
    embedding_refined = embedding_model.encode(refined_prompt)
    similarity = util.cos_sim(embedding_original, embedding_refined).item()

    row_data = {
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'original_prompt': original_prompt,
        'refined_prompt': refined_prompt,
        'original_score': original_score,
        'refined_score': refined_score,
        'semantic_similarity': f"{similarity:.3f}"
    }
    file_exists = os.path.isfile(filepath)
    with open(filepath, 'a', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=headers)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row_data)
    print(f"✅ Statistical results logged to {filepath}")


def refine_prompt_with_llm(original_prompt, score, feedback, gauntlet_id):
    gauntlet = GAUNTLETS.get(gauntlet_id)
    if not gauntlet:
        return {"error": "Invalid refinement goal."}

    refinement_meta_prompt = f"""
    You are an expert prompt engineer. Your task is to rewrite a user's prompt based on an evaluation and a specific goal.
    Original Prompt: "{original_prompt}"
    Evaluation Score: {score}/100
    Evaluation Feedback: "{feedback}"
    Your Specific Goal: {gauntlet['instruction']}
    Instructions:
    - Rewrite the prompt to address the feedback AND achieve the specific goal.
    - Return ONLY the refined prompt text.
    Refined Prompt:
    """
    try:
        groq_response = groq_client.chat.completions.create(
            model="llama3-8b-8192", messages=[{"role": "user", "content": refinement_meta_prompt}], max_tokens=500
        )
        refined_prompt = groq_response.choices[0].message.content.strip()

        refined_evaluation = run_metric_based_evaluation(refined_prompt)
        log_statistical_results(original_prompt, refined_prompt, score, refined_evaluation['final_score'])

        return {"refined_prompt": refined_prompt}
    except Exception as e:
        print(f"An error occurred during refinement: {e}")
        return {"error": "Failed to get a response from the AI."}