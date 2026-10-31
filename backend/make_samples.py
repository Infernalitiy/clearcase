"""Create three FICTIONAL sample documents (PNG) and their cached analysis (JSON).

  python backend/make_samples.py          # draw PNGs, then analyze them (needs Bedrock key)
  python backend/make_samples.py --images # draw PNGs only

All names, numbers and organisations are made up.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SAMPLES = os.path.join(ROOT, "samples")
W, H = 1275, 1650  # US letter at 150 dpi


def font(size, bold=False):
    names = (["arialbd.ttf", "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"] if bold
             else ["arial.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf"])
    for n in names:
        for d in ("", "C:/Windows/Fonts/", "/usr/share/fonts/truetype/dejavu/", "/Library/Fonts/"):
            try:
                return ImageFont.truetype(d + n, size)
            except OSError:
                pass
    return ImageFont.load_default(size)


class Page:
    def __init__(self):
        self.img = Image.new("RGB", (W, H), "white")
        self.d = ImageDraw.Draw(self.img)
        self.y = 70
        self.lines = []  # every string drawn, for checking original_text later

    def text(self, s, size=24, bold=False, x=80, color="black", gap=10):
        self.d.text((x, self.y), s, font=font(size, bold), fill=color)
        self.lines.append(s)
        self.y += size + gap

    def row(self, cols, size=22, bold=False, xs=(80, 330, 900), gap=10):
        for s, x in zip(cols, xs):
            self.d.text((x, self.y), s, font=font(size, bold), fill="black")
            self.lines.append(s)
        self.y += size + gap

    def rule(self, gap=18, width=2):
        self.y += 4
        self.d.line((80, self.y, W - 80, self.y), fill="#444", width=width)
        self.y += gap

    def box(self, top, bottom, fill=None, outline="#222"):
        self.d.rectangle((70, top, W - 70, bottom), fill=fill, outline=outline, width=2)

    def footer(self):
        self.y = H - 60
        self.text("SAMPLE - FICTIONAL. Not a real document. All names and numbers are made up.", size=14, color="#555")

    def save(self, name):
        self.img.save(os.path.join(SAMPLES, f"{name}.png"))
        return self.lines


def bill():
    p = Page()
    p.text("MAPLEWOOD GENERAL HOSPITAL", 40, True)
    p.text("Patient Financial Services  |  1200 Orchard Lane, Springvale, OH 45001", 20, color="#333")
    p.rule()
    p.text("PATIENT STATEMENT", 30, True)
    p.row(["Patient:", "Jordan Rivera"], bold=False)
    p.row(["Account number:", "MGH-0048213"])
    p.row(["Statement date:", "October 20, 2026"])
    p.row(["Date of service:", "September 28, 2026"])
    p.rule()
    p.row(["Code", "Description", "Charge"], bold=True)
    p.row(["99284", "Emergency department visit, level 4", "$1,250.00"])
    p.row(["71046", "Chest X-ray, 2 views", "$310.00"])
    p.row(["80053", "Comprehensive metabolic panel (lab)", "$185.00"])
    p.row(["J7030", "IV fluids, normal saline 1000 mL", "$96.00"])
    p.rule(width=1)
    p.row(["", "Total charges", "$1,841.00"])
    p.row(["", "Insurance paid (Evergreen Health Plan)", "-$1,108.83"])
    p.row(["", "Insurance adjustment", "-$250.00"])
    p.row(["", "Patient responsibility", "$482.17"], bold=True)
    p.rule()
    top = p.y
    p.y += 15
    p.text("AMOUNT DUE: $482.17", 36, True, x=100)
    p.text("PAYMENT DUE BY: November 30, 2026", 28, True, x=100)
    p.y += 5
    p.box(top, p.y)
    p.y += 25
    p.text("Questions about this bill? Call Patient Financial Services at (555) 014-2290,", 22)
    p.text("Monday to Friday, 8 AM to 5 PM, or email billing@maplewood-example.org.", 22)
    p.y += 10
    p.text("Financial assistance may be available. Ask about our payment plans and charity care.", 22)
    p.text("If you think this bill is wrong, you can request an itemized bill.", 22)
    p.y += 10
    p.text("Pay online at maplewood-example.org/pay using your account number.", 22)
    p.footer()
    return p.save("bill")


def denial():
    p = Page()
    p.text("EVERGREEN HEALTH PLAN", 40, True)
    p.text("Member Services  |  PO Box 7781, Lakeport, OH 45099", 20, color="#333")
    p.rule()
    p.text("NOTICE OF ADVERSE BENEFIT DETERMINATION", 30, True)
    p.text("This is not a bill.", 24, True)
    p.y += 5
    p.row(["Date of notice:", "October 15, 2026"])
    p.row(["Member:", "Alex Chen"])
    p.row(["Member ID:", "EVG-552190-03"])
    p.row(["Claim number:", "CLM-2026-118845"])
    p.row(["Provider:", "Northside Imaging Center"])
    p.row(["Service:", "MRI, lumbar spine without contrast (72148)"])
    p.row(["Date of service:", "September 3, 2026"])
    p.row(["Amount billed:", "$2,140.00"])
    p.row(["Amount covered:", "$0.00"], bold=True)
    p.rule()
    p.text("Why your claim was denied", 26, True)
    p.text("Reason code PA-04: Prior authorization was not obtained before the service.", 22)
    p.text("Your plan requires prior authorization for advanced imaging such as MRI.", 22)
    p.y += 10
    p.text("Your right to appeal", 26, True)
    p.text("You or your provider may file an appeal within 180 days of the date of this notice.", 22)
    p.text("Appeal deadline: April 13, 2027", 24, True)
    p.text("Send a written appeal with a copy of this notice to the address above, or use", 22)
    p.text("the member portal at evergreen-example.com/appeals.", 22)
    p.text("Your provider may also request a retroactive authorization.", 22)
    p.y += 10
    p.text("Questions? Call Member Services at 1-800-555-0177 (TTY 711).", 22)
    p.text("You may also email appeals@evergreen-example.com.", 22)
    p.y += 10
    p.text("You may be billed by the provider for this service. Do not ignore bills while you appeal.", 22)
    p.footer()
    return p.save("denial")


def discharge():
    p = Page()
    p.text("LAKESIDE MEDICAL CENTER", 40, True)
    p.text("Discharge Instructions", 30, True)
    p.rule()
    p.row(["Patient:", "Sam Okafor"])
    p.row(["Discharge date:", "October 27, 2026"])
    p.row(["Diagnosis:", "Community-acquired pneumonia"])
    p.row(["Doctor:", "Dr. Priya Patel, Internal Medicine"])
    p.rule()
    p.text("Your medicines", 26, True)
    p.text("1. Amoxicillin 500 mg capsule: take 1 capsule by mouth 3 times a day for 7 days.", 22)
    p.text("   Finish all of it, even if you feel better.", 22)
    p.text("2. Acetaminophen 500 mg tablet: take 1 to 2 tablets every 6 hours as needed for fever.", 22)
    p.text("   Do not take more than 6 tablets in 24 hours.", 22)
    p.y += 10
    p.text("Activity and care at home", 26, True)
    p.text("Rest and drink plenty of fluids. No driving while you feel very tired.", 22)
    p.text("Use your incentive spirometer 10 times every hour while awake.", 22)
    p.y += 10
    p.text("Follow-up appointment", 26, True)
    p.text("See Dr. Priya Patel on November 6, 2026 at 10:30 AM.", 22)
    p.text("Lakeside Clinic, 2nd floor. Phone: (555) 013-4400.", 22)
    p.y += 10
    top = p.y
    p.y += 12
    p.text("WHEN TO GET HELP", 26, True, x=100)
    p.text("Call 911 right away if you have trouble breathing, chest pain, or lips turning blue.", 22, x=100)
    p.text("Call your doctor if your fever is over 101 F for more than 2 days, or you cannot keep", 22, x=100)
    p.text("medicines down.", 22, x=100)
    p.y += 4
    p.box(top, p.y)
    p.y += 20
    p.text("Patient portal: lakeside-example.org/mychart  |  Nurse line: (555) 013-4499", 22)
    p.footer()
    return p.save("discharge")


def norm(s):
    from app import norm as n
    return n(s)


if __name__ == "__main__":
    os.makedirs(SAMPLES, exist_ok=True)
    drawn = {"bill": bill(), "denial": denial(), "discharge": discharge()}
    print("Drew:", ", ".join(f"samples/{n}.png" for n in drawn))
    if "--images" in sys.argv:
        sys.exit(0)

    from app import analyze_image_bytes
    all_ok = True
    for name, lines in drawn.items():
        with open(os.path.join(SAMPLES, f"{name}.png"), "rb") as fh:
            result = analyze_image_bytes(fh.read())
        page = norm(" \n ".join(lines))
        for f in result["facts"]:
            ok = norm(f["original_text"]) in page
            all_ok &= ok
            print(f"  [{'OK ' if ok else 'BAD'}] {name}/{f['id']}: {f['original_text'][:70]}")
        with open(os.path.join(SAMPLES, f"{name}.json"), "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=2, ensure_ascii=False)
        print(f"Wrote samples/{name}.json ({len(result['facts'])} facts, confidence {result['confidence']})")
    print("All original_text found in images." if all_ok else "SOME original_text NOT FOUND - review above.")
