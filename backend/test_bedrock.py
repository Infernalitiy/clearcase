"""Step 0: verify Bedrock access. Lists Claude inference profiles, then sends a text
message and an image to the chosen model. Never prints the API key."""
import io
import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import boto3
from botocore.config import Config
from PIL import Image, ImageDraw

REGION = "us-east-1"
cfg = Config(read_timeout=60, connect_timeout=10, retries={"max_attempts": 1})

if not os.environ.get("AWS_BEARER_TOKEN_BEDROCK"):
    sys.exit("AWS_BEARER_TOKEN_BEDROCK is not set (put it in .env)")

print("== Claude inference profiles ==")
try:
    bedrock = boto3.client("bedrock", region_name=REGION, config=cfg)
    profiles = bedrock.list_inference_profiles(maxResults=100)["inferenceProfileSummaries"]
    for p in profiles:
        if "anthropic" in p["inferenceProfileId"]:
            print(" ", p["inferenceProfileId"], "-", p.get("status"))
except Exception as e:
    print("  could not list profiles:", type(e).__name__, e)

model = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
rt = boto3.client("bedrock-runtime", region_name=REGION, config=cfg)

print("\n== Text test with", model, "==")
r = rt.converse(modelId=model, messages=[{"role": "user", "content": [{"text": "Reply with exactly: ClearCase OK"}]}],
                inferenceConfig={"maxTokens": 20})
print(" ", r["output"]["message"]["content"][0]["text"])

print("\n== Image test ==")
img = Image.new("RGB", (400, 120), "white")
ImageDraw.Draw(img).text((20, 40), "AMOUNT DUE: $123.45", fill="black")
buf = io.BytesIO(); img.save(buf, "PNG")
r = rt.converse(modelId=model, messages=[{"role": "user", "content": [
    {"image": {"format": "png", "source": {"bytes": buf.getvalue()}}},
    {"text": "What amount is shown in this image? Answer in one short line."}]}],
    inferenceConfig={"maxTokens": 50})
print(" ", r["output"]["message"]["content"][0]["text"])
