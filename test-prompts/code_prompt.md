# Quicksort Implementation Prompt

I need to write a quicksort algorithm.

Here is a template of the python file:

```
# This is a comment that is completely redundant and explains nothing.
# We should try to optimize this comment or remove it to save tokens.
def quicksort(arr): # Base case of the recursion if len(arr) <= 1: return arr pivot = arr[len(arr) // 2] left = [x for x in arr if x < pivot] middle = [x for x in arr if x == pivot] right = [x for x in arr if x > pivot] return quicksort(left) + middle + quicksort(right)
```

Please refactor this to be in-place.