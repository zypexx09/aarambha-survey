import nltk
import sys

def setup():
    print("Downloading required NLTK resources...")
    resources = [
        'punkt',
        'averaged_perceptron_tagger',
        'stopwords',
        'vader_lexicon'
    ]
    for res in resources:
        try:
            print(f"Downloading {res}...")
            nltk.download(res, quiet=True)
            print(f"Successfully downloaded {res}")
        except Exception as e:
            print(f"Error downloading {res}: {e}", file=sys.stderr)

if __name__ == "__main__":
    setup()
