import { QuestionSpec } from './shared/series'

// Default Questions, selected for the Wk 4–6 pilot from QUESTION_GUIDE.md, grouped by what they ask about:
//   repeatLoop: QUESTION_BANK.coreLoop.repeatLoop
// Sections are only for finding Questions; ids stay unique across the bank.
//
// Each comment: when to ask (the player must have encountered the situation, not
// necessarily succeeded) · what the answer tells you · the Question's code in QUESTION_GUIDE.md.
// The rating scale is the `scale` field: a code from shared/scales.ts, labels under the tiles.
//
// Generic words in the texts — the main activity, the goal, the rewards, the important
// objects — are meant to be swapped for your game's own. A reworded Question goes into
// your series under your own id (see README, Tips), so answers to different wordings never
// share an id.
//
// Comment prompts are tailored per Question but stay neutral, open to both good
// and bad experiences: asking only for problems skews the comments. The generic
// fallback is "What most affected your rating? (optional)".
export const QUESTION_BANK = {

  // ---- CORE MECHANIC ----
  // The main action: how to succeed, reading the result, getting better at it (response to an action, challenge and learning)
  coreMechanic: {
    // after a score or success was shown · learns: are score/success cues noticed, or missed · E04
    scoreCues: {
      text: 'How easy or difficult was it to tell how well you were doing?',
      scale: 'EASE',
      commentPrompt: 'What showed you how well you were doing, or what was missing? (optional)'
    },
    // after facing a challenge · learns: is the win condition taught, or guessed · H02
    winCondition: {
      text: 'How clear was what you needed to do to succeed?',
      scale: 'CLEAR',
      commentPrompt: 'What helped or confused you about how to succeed? (optional)'
    },
    // after several attempts · learns: does it feel like skill, or like luck · H04
    improvement: {
      text: 'How much did you feel you improved while playing?',
      scale: 'AMOUNT',
      commentPrompt: 'What, if anything, did you get better at? (optional)'
    },
    // when key objects had to be told apart · learns: do key objects need more visual contrast · Q07
    objectContrast: {
      text: 'How easy or difficult was it to tell the important objects apart?',
      scale: 'EASE',
      commentPrompt: 'Which objects were easy or hard to tell apart? (optional)'
    }
  },

  // ---- CORE LOOP ----
  // Progress, pace, rewards, repetition, what comes next
  coreLoop: {
    // while working toward a goal · learns: is a progress indicator missing · P03
    progressVisible: {
      text: 'How clear was your progress toward the goal?',
      scale: 'CLEAR',
      commentPrompt: 'What showed your progress, or what would have helped? (optional)'
    },
    // after receiving rewards · learns: do rewards match the effort they cost · P05
    rewards: {
      text: 'How satisfying were the rewards you received?',
      scale: 'SATISFY',
      commentPrompt: 'Which reward stood out, for better or worse? (optional)'
    },
    // after repeating the main activity · learns: does the loop wear thin, how fast · P06
    repeatLoop: {
      text: 'How enjoyable was repeating the main activity?',
      scale: 'ENJOY',
      commentPrompt: 'What made repeating it more or less fun? (optional)'
    },
    // after completing a goal, when more play is intended · learns: do players stall or leave here · P10
    nextGoal: {
      text: 'After completing a goal, how clear was what to do next?',
      scale: 'CLEAR',
      commentPrompt: 'What did you think you should do next? (optional)'
    }
  },

  // ---- SOCIAL ----
  // Playing with others, and on your own
  social: {
    // after seeing other players doing an activity · learns: can bystanders learn it by watching · S01
    othersReadable: {
      text: 'How easy or difficult was it to tell what other players were doing?',
      scale: 'EASE',
      commentPrompt: "What made other players' actions easy or hard to follow? (optional)"
    },
    // after trying to join, including unsuccessful attempts · learns: is an explicit join flow needed · S03
    joining: {
      text: 'How easy or difficult was it to join an activity with other players?',
      scale: 'EASE',
      commentPrompt: 'What happened when you tried to join? (optional)'
    },
    // after actual shared play · learns: does multiplayer add value, or friction · S06
    playingTogether: {
      text: 'How enjoyable was playing with other people?',
      scale: 'ENJOY',
      commentPrompt: 'What made playing with others better or worse? (optional)'
    },
    // after actual solo play (others merely visible is not shared play) · learns: is it viable when empty · S09
    playingAlone: {
      text: 'How enjoyable was playing on your own?',
      scale: 'ENJOY',
      commentPrompt: 'What made playing on your own better or worse? (optional)'
    }
  },

  // ---- MOTIVATION ----
  // Wanting more now, coming back, inviting friends, worth the visit
  motivation: {
    // at a pause · learns: do sessions end too soon, or drag · T01
    playMore: {
      text: 'How interested are you in playing more right now?',
      scale: 'INTEREST',
      commentPrompt: 'What makes you want to keep playing, or stop? (optional)'
    },
    // near the end of a visit, if revisits matter · learns: is there a reason to come back · T02
    comeBack: {
      text: 'How interested are you in coming back another day?',
      scale: 'INTEREST',
      commentPrompt: 'What, if anything, would bring you back? (optional)'
    },
    // when repeatable content exists · learns: is the repeatable content signposted · T03
    nextVisit: {
      text: 'How clear is what you could do on another visit?',
      scale: 'CLEAR',
      commentPrompt: 'What would you do on your next visit? (optional)'
    },
    // after something worth sharing · learns: is there a word-of-mouth hook · T08
    inviteFriend: {
      text: 'How interested are you in inviting a friend to play?',
      scale: 'INTEREST',
      commentPrompt: 'What would you tell a friend about it? (optional)'
    },
    // at a stopping point · learns: the overall verdict, comparable across builds · T09
    worthIt: {
      text: 'How worthwhile did this visit feel?',
      scale: 'WORTH',
      commentPrompt: 'What made the visit worth your time, or not? (optional)'
    }
  },

  // ---- WORLD ----
  // The space and its mood
  world: {
    // after experiencing the space · learns: do art and sound land as intended · W04
    atmosphere: {
      text: 'How enjoyable was the atmosphere?',
      scale: 'ENJOY',
      commentPrompt: 'What shaped the atmosphere for you? (optional)'
    }
  },

  // ---- TECHNICAL ----
  // How smoothly it ran, getting unstuck
  technical: {
    // after actually playing · learns: is performance a felt problem · Q01
    smoothness: {
      text: 'How satisfied were you with how smoothly the game ran?',
      scale: 'SATISFIED',
      commentPrompt: 'Where, if anywhere, did it slow down or stutter? (optional)'
    },
    // after getting stuck · learns: is a reset or respawn missing · Q04
    gettingUnstuck: {
      text: 'After getting stuck, how easy or difficult was it to get back to playing?',
      scale: 'EASE',
      commentPrompt: 'What got you stuck, and how did you get out? (optional)'
    }
  }
} satisfies Record<string, Record<string, QuestionSpec>>
