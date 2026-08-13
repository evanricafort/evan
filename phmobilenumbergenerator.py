import random
 
# Telco prefixes for Philippines
telco_prefixes = [
    # Globe/TM
    "917", "926", "927", "936", "937", "939", "978", "979",
    # Smart/TNT
    "918", "919", "920", "922", "923", "924", "925", "930", "931", "932", "933", "934", "935", "938", "948", "949", "963", "964", "965", "966", "967", "968", "969",
    # DITO
    "991", "992", "993", "994", "995"
]
 
num_numbers = 1000
numbers = []
 
for _ in range(num_numbers):
    prefix = random.choice(telco_prefixes)
    suffix = "".join([str(random.randint(0, 9)) for _ in range(7)])
    number = prefix + suffix  # Already starts with 9
    numbers.append(number)
 
# Save to TXT file
file_path = "philippine_mobile_numbers.txt"
with open(file_path, "w") as f:
    f.write("\n".join(numbers))
 
file_path