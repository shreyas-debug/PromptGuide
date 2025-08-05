import textstat
import nltk
from nltk.tokenize import word_tokenize, sent_tokenize

# --- 1. Clarity & Readability Metrics ---

def calculate_reading_ease(text):
    """Calculates Flesch Reading Ease. Higher is better (easier to read)."""
    return textstat.flesch_reading_ease(text)

def calculate_lexical_diversity(text):
    """Calculates lexical diversity (unique words / total words). Higher is better."""
    words = word_tokenize(text.lower())
    if not words:
        return 0
    return len(set(words)) / len(words)

# --- 2. Specificity & Intent Metrics ---

def count_action_verbs(text):
    """Counts the number of common 'action' verbs in a prompt."""
    ACTION_VERBS = ['explain', 'generate', 'create', 'write', 'summarize', 'list', 'compare', 'analyze', 'translate', 'classify']
    words = word_tokenize(text.lower())
    return sum(1 for word in words if word in ACTION_VERBS)

def count_constraints(text):
    """Counts the number of common 'constraint' phrases."""
    CONSTRAINT_PHRASES = ['in the style of', 'as a', 'format as', 'ensure that', 'must include', 'with a focus on']
    return sum(1 for phrase in CONSTRAINT_PHRASES if phrase in text.lower())

def get_prompt_length_score(text):
    """Scores the prompt based on its length."""
    length = len(word_tokenize(text))
    if length < 5:
        return 0
    if length < 15:
        return 5
    return 10