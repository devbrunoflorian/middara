import json

dom_file = r"C:\Users\bruno\Middara\Rulebook App\apps\web\public\pages\page_012\page_012_dom.json"
with open(dom_file, "r", encoding="utf-8") as f:
    data = json.load(f)

translations = {
    "SCENE NAME: ": "NOME DA CENA: ",
    "Unique name of the Scene in the Adventure Book. ": "Nome único da Cena no Livro de Aventuras.",
    "SCENE NARRATIVE: ": "NARRATIVA DA CENA: ",
    "This section is meant to be read out loud. All Scenes have a narrative section.": "Esta seção deve ser lida em voz alta. Todas as Cenas têm uma seção de narrativa.",
    "ADVENTURE MECHANICS:": "MECÂNICAS DE AVENTURA:",
    "When an Adventure Mechanic appears, stop and follow its instructions. Adventure Mechanics come in different varieties. \nSee Adventure Mechanics Pg. 10. ": "Quando uma Mecânica de Aventura aparecer, pare e siga suas instruções. Mecânicas de Aventura vêm em várias formas.\nVeja Mecânicas de Aventura Pág. 10.",
    "Scene Breakdown": "Resumo da Cena",
    " Check out the Loot": " Inspecionar o Saque",
    "This looks like a good spot! Remi tried to sound enthusiastic. ": "\"Parece um bom lugar!\" Remi tentou soar entusiasmada.",
    "The cavern they had chosen to spend the night in had a ceiling at least twenty feet up. Damp stalactites glittered in the light of their glowstones, occasionally dripping water. Even so, the fl oor was dry and fl at enough to serve their needs.": "A caverna que escolheram para passar a noite tinha um teto a pelo menos vinte pés de altura. Estalactites úmidas brilhavam à luz de suas pedras luminosas, pingando água ocasionalmente. Mesmo assim, o chão estava seco e plano o suficiente para servir às suas necessidades.",
    "I like it. Rook gestured ahead with one meaty hand. Only one other way out. Should be easy to keep watch.": "\"Eu gosto.\" Rook gesticulou à frente com a mão carnuda. \"Só mais uma saída. Deve ser fácil vigiar.\"",
    "Nightingale hurried past Remi into the cavern. Wouldnt it be sweet if we were the fi rst team ever to fi nish the MAST in one day?": "Nightingale passou apressado por Remi para dentro da caverna. \"Não seria legal se fôssemos a primeira equipe a terminar o TAHM em um dia?\"",
    "Zeke stopped right in the middle of the cave, sloughing off his heavy pack. It dropped with a dull thud at his feet. But we wont. Its going to get harder. We need a rest if we want to fi nish this with all our limbs.": "Zeke parou no meio da caverna, tirando a mochila pesada. Ela caiu com um baque surdo. \"Mas não vamos. Vai ficar mais difícil. Precisamos descansar se quisermos terminar isso com todos os membros do corpo.\"",
    "Remi needed no further encouragement to drop her pack. She closed her eyes, letting her massive wings stretch and fl ex. It felt fantastic, at least until she felt them smack something.": "Remi não precisou de mais encorajamento para largar a mochila. Ela fechou os olhos, alongando e flexionando suas enormes asas. Foi fantástico, até que ela sentiu as asas baterem em algo.",
    "Ow! Zeke yelped.": "\"Ai!\" Zeke gritou.",
    "Sorry! Remi blushed, retreating a little. I didnt mean to": "\"Desculpe!\" Remi corou, recuando um pouco. \"Eu não queria...\"",
    "Nah, its nothing. Zeke shrugged, wiping a feather off his cheek. Its better than being slapped by Nights tail. ": "\"Nah, não foi nada.\" Zeke deu de ombros, limpando uma pena da bochecha. \"É melhor do que ser esbofeteado pela cauda do Night.\"",
    "I havent done that in ages. Nightingale glared at him. Ill start the fi re. ": "\"Não faço isso há séculos.\" Nightingale o encarou. \"Vou acender a fogueira.\"",
    "I can help. Rook set his bag down at his feet, fi shing around for a few seconds before pulling out fl int and steel. ": "\"Posso ajudar.\" Rook largou a bolsa aos pés, procurando por alguns segundos antes de puxar pederneira e aço.",
    "Id like to do it! Nightingale said with excitement as she took the tools from Rook. The MAST is supposed to prepare us for ": "\"Eu gostaria de fazer isso!\" Nightingale disse animada enquanto pegava as ferramentas de Rook. \"O TAHM deveria nos preparar para ",
    "whatever Middara can throw at us. That means no shortcuts!": "tudo que Middara pode lançar. Isso significa sem atalhos!\"",
    "Rook reached into his bag, withdrawing a bundle of sticks and a box of tinder. No shortcuts? he asked, holding them out for her.": "Rook enfiou a mão na bolsa, tirando um feixe de gravetos e gravetos secos. \"Sem atalhos?\" perguntou, estendendo-os a ela.",
    "\"Fine,\" she said, taking the sticks.": "\"Certo\", disse ela, pegando os gravetos.",
    "Remi frowned, thinking of what she could do. The other members of the team all seemed to know one another already, but they barely knew her name. I could set up the tents!": "Remi franziu a testa, pensando no que poderia fazer. Os outros membros da equipe já pareciam se conhecer, mas mal sabiam o nome dela. \"Eu poderia montar as barracas!\"",
    "Sure. Zeke was the last to separate, weapon in hand. Ill scout the cave for traps, just in case.": "\"Claro.\" Zeke foi o último a se separar, arma em mãos. \"Vou explorar a caverna em busca de armadilhas, só por precaução.\"",
    "Z": "Z",
    "eke walked the perimeter of the cave, scraping along the rock with his sword. Where the gloom concealed, he used his weapon to check for danger. There was no way to guess what the proctors might try to throw at them. Giant rats set loose into the camp while they slept? Pipes to fl ood the cave? Whatever the Institute had planned, Zeke would be ready.": "eke caminhou pelo perímetro da caverna, raspando a rocha com sua espada. Onde a escuridão escondia, ele usou a arma para verificar o perigo. Não havia como adivinhar o que os fiscais poderiam tentar. Ratos gigantes soltos no acampamento enquanto dormiam? Canos para inundar a caverna? Seja o que o Instituto planejasse, Zeke estaria pronto.",
    "He didnt fi nd any secret passages, hidden traps, or insidious ways to torment them in their sleep. As he neared the end of the search, he struck a section of rough wall that thumped strangely when he hit it. Hey, guys, I think theres something here! he called before dropping onto his knees and feeling around. After a few seconds, a little lever gave way under his touch.": "Ele não encontrou passagens secretas, armadilhas ocultas ou formas tortuosas de atormentá-los enquanto dormiam. Ao se aproximar do fim da busca, ele atingiu uma seção de parede áspera que bateu de forma estranha. \"Ei pessoal, acho que tem algo aqui!\" ele chamou antes de cair de joelhos e tatear ao redor. Depois de alguns segundos, uma pequena alavanca cedeu sob seu toque.",
    "A facade retracted from the wall, revealing a tightly wrapped bundle. He kicked at it, sending it rolling out of the opening and onto the fl oor in front of him without exploding, shooting acid, or sending spikes at him through the fl oor.": "Uma fachada retraiu-se da parede, revelando um fardo bem embrulhado. Ele chutou-o, fazendo-o rolar para fora da abertura e cair no chão à sua frente sem explodir, disparar ácido ou lançar espinhos através do chão.",
    "He grinned, lifting the bundle of burlap and holding it up for the rest of his team to see. Hey, everybody, I found a care package.": "Ele sorriu, erguendo o fardo de estopa para o resto da equipe ver. \"Ei pessoal, achei um pacote de suprimentos.\"",
    "Nice work! Rook called, not rising from his work around their makeshift fi repit. They must have hidden some supplies like this for the groups who actually pay attention.": "\"Bom trabalho!\" Rook chamou, sem levantar-se do trabalho ao redor de sua fogueira improvisada. \"Devem ter escondido suprimentos assim para os grupos que prestam atenção.\"",
    "Skill Check:Make a Perception 10 Check with Zeke.": "Teste de Habilidade: Faça um Teste de Percepção 10 com Zeke.",
    " SUCCESS": " SUCESSO",
    "If Zeke passes, Continue to Check out the Loot Pg. 9": "Se Zeke passar, Prossiga para Inspecionar o Saque Pág. 9",
    " FAIL": " FALHA",
    "If Zeke fails, Continue to Cozy Fire Pg. 10": "Se Zeke falhar, Prossiga para Fogueira Aconchegante Pág. 10",
    "Continue to Cozy Fire Pg. 10": "Prossiga para Fogueira Aconchegante Pág. 10",
    "            Reward: The party Gains 4 random Mundane Consumables.": "            Recompensa: O grupo Ganha 4 Consumíveis Comuns aleatórios.",
    " Setting up Camp": " Montando Acampamento"
}

def translate_text(text):
    # Try exact match
    if text in translations:
        return translations[text]
    # Replace smart quotes with normal ones before lookup
    clean_text = text.replace('', '"')
    for k, v in translations.items():
        if clean_text == k.replace('', '"'):
            return v
            
    # Substring translation for mechanics
    if "SCENE NAME:" in text:
        return text.replace("SCENE NAME:", "NOME DA CENA:")
    if "SCENE NARRATIVE:" in text:
        return text.replace("SCENE NARRATIVE:", "NARRATIVA DA CENA:")
    
    return text

for block in data['blocks']:
    for line in block.get('lines', []):
        for span in line.get('spans', []):
            span['text'] = translate_text(span['text'])
            
with open(dom_file, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
