# Question bank

113 candidate Questions, by topic, to pick from. When and how to ask them, and ready-made sets:
[QUESTION_GUIDE.md](QUESTION_GUIDE.md).

Scale codes are in [lib/shared/scales.ts](src/playtest-feedback/lib/shared/scales.ts). The 20 with
an id are ready in [lib/bank.ts](src/playtest-feedback/lib/bank.ts), with a tailored comment
prompt; for the rest, add your own entry in `questions.ts`. Words in [brackets] are placeholders
for your game's own.

## F · Starting, goals, and finding your way

| Code | Question | Scale | In bank.ts |
|---|---|---|---|
| F01 | How easy or difficult was it to work out what to do first? | EASE |  |
| F02 | How clear was the main goal? | CLEAR |  |
| F03 | How clear were the rules? | CLEAR |  |
| F04 | How easy or difficult were the instructions to understand? | EASE |  |
| F05 | How easy or difficult was it to find things you could interact with? | EASE |  |
| F06 | How easy or difficult was it to start the activity? | EASE |  |
| F07 | How clear was when the activity was finished? | CLEAR |  |
| F08 | How easy or difficult was it to find the place you wanted to go? | EASE |  |
| F09 | How easy or difficult was it to find help when you needed it? | EASE |  |
| F10 | After the tutorial, how confident were you about playing on your own? | CONFIDENT |  |
| F11 | When you arrived, how clear was what was happening in the current round? | CLEAR |  |

## C · Controls and interface

| Code | Question | Scale | In bank.ts |
|---|---|---|---|
| C01 | How easy or difficult was it to use the controls? | EASE |  |
| C02 | How easy or difficult was it to move where you wanted? | EASE |  |
| C03 | How easy or difficult was it to aim where you wanted? | EASE |  |
| C04 | How easy or difficult was it to control the camera? | EASE |  |
| C05 | How easy or difficult was it to select the object you wanted? | EASE |  |
| C06 | How easy or difficult was it to read the text? | EASE |  |
| C07 | How easy or difficult was it to find the menu option you needed? | EASE |  |
| C08 | How easy or difficult was it to notice important information during play? | EASE |  |
| C09 | How clear was what each button would do? | CLEAR |  |
| C10 | How easy or difficult was it to tap the button you wanted? | EASE |  |
| C11 | How clear was whether to tap or hold the button? | CLEAR |  |

## E · Enjoyment and the response to an action

| Code | Question | Scale | In bank.ts |
|---|---|---|---|
| E01 | How enjoyable was the main activity? | ENJOY |  |
| E02 | Overall, how enjoyable was this visit? | ENJOY |  |
| E03 | How clear was the result of your actions? | CLEAR |  |
| E04 | How easy or difficult was it to tell how well you were doing? | EASE | `scoreCues` |
| E05 | How satisfying did [the action] feel? | SATISFY |  |
| E06 | How satisfying did moving around feel? | SATISFY |  |
| E07 | How clear was why you got that result? | CLEAR |  |
| E08 | How easy or difficult was it to tell when an action worked? | EASE |  |
| E09 | How easy or difficult was it to tell when an action did not work? | EASE |  |
| E10 | How well did the activity hold your attention? | FIT |  |
| E11 | When you couldn't [water the plant], how clear was the reason? | CLEAR |  |

## H · Challenge, fairness, and learning

| Code | Question | Scale | In bank.ts |
|---|---|---|---|
| H01 | How well did the difficulty suit you? | FIT |  |
| H02 | How clear was what you needed to do to succeed? | CLEAR | `winCondition` |
| H03 | How fair did the result feel? | FAIR |  |
| H04 | How much did you feel you improved while playing? | AMOUNT | `improvement` |
| H05 | After your last failed attempt, how clear was what you could try next? | CLEAR |  |
| H06 | After your last failed attempt, how interested were you in trying again? | INTEREST |  |
| H07 | How fair did the penalty for failing feel? | FAIR |  |
| H08 | How well did the time limit suit you? | FIT |  |
| H09 | How fair did the match with your opponent feel? | FAIR |  |
| H10 | How satisfied were you with how the difficulty increased? | SATISFIED |  |
| H11 | After failing, how clear was what progress you kept? | CLEAR |  |

## A · Choices, freedom, and expression

| Code | Question | Scale | In bank.ts |
|---|---|---|---|
| A01 | How interesting were the choices you had to make? | INTERESTING |  |
| A02 | How satisfied were you with the freedom to try different approaches? | SATISFIED |  |
| A03 | How clear were the differences between your options? | CLEAR |  |
| A04 | Before choosing, how clear were the possible results? | CLEAR |  |
| A05 | How satisfied were you with how your choices affected the game? | SATISFIED |  |
| A06 | How well could you express your own style? | FIT |  |
| A07 | How satisfied were you with the customization options? | SATISFIED |  |
| A08 | How easy or difficult was it to try a different approach? | EASE |  |
| A09 | How satisfied were you with the freedom to choose your own goals? | SATISFIED |  |
| A10 | How easy or difficult was it to change your mind after choosing? | EASE |  |

## P · Pace, progression, rewards, and repetition

| Code | Question | Scale | In bank.ts |
|---|---|---|---|
| P01 | How well did the pace of the game suit you? | FIT |  |
| P02 | How satisfied were you with the amount of waiting between activities? | SATISFIED |  |
| P03 | How clear was your progress toward the goal? | CLEAR | `progressVisible` |
| P04 | How satisfied were you with how quickly you made progress? | SATISFIED |  |
| P05 | How satisfying were the rewards you received? | SATISFY | `rewards` |
| P06 | How enjoyable was repeating the main activity? | ENJOY | `repeatLoop` |
| P07 | How satisfied were you with the variety of activities? | SATISFIED |  |
| P08 | How well did the length of a round suit you? | FIT |  |
| P09 | How satisfied were you with what you accomplished? | SATISFIED |  |
| P10 | After completing a goal, how clear was what to do next? | CLEAR | `nextGoal` |
| P11 | How clear was what you could use [coins] for? | CLEAR |  |
| P12 | How clear was when you could [water a plant] again? | CLEAR |  |

## W · World, story, sound, and atmosphere

| Code | Question | Scale | In bank.ts |
|---|---|---|---|
| W01 | How much did you like the look of the world? | AMOUNT |  |
| W02 | How much did you like the sound of the world? | AMOUNT |  |
| W03 | How well did the different parts of the world fit together? | FIT |  |
| W04 | How enjoyable was the atmosphere? | ENJOY | `atmosphere` |
| W05 | How clear was your role in the story? | CLEAR |  |
| W06 | How easy or difficult was the story to follow? | EASE |  |
| W07 | How interested were you in finding out what happened next in the story? | INTEREST |  |
| W08 | How enjoyable was exploring the world? | ENJOY |  |
| W09 | How satisfying were the things you discovered? | SATISFY |  |
| W10 | How well did the atmosphere fit this activity? | FIT |  |

## S · Shared play and being alone

| Code | Question | Scale | In bank.ts |
|---|---|---|---|
| S01 | How easy or difficult was it to tell what other players were doing? | EASE | `othersReadable` |
| S02 | How easy or difficult was it to communicate with other players? | EASE |  |
| S03 | How easy or difficult was it to join an activity with other players? | EASE | `joining` |
| S04 | How easy or difficult was it to coordinate with your teammates? | EASE |  |
| S05 | How clear was your role in the team? | CLEAR |  |
| S06 | How enjoyable was playing with other people? | ENJOY | `playingTogether` |
| S07 | How comfortable did you feel interacting with other players? | COMFORT |  |
| S08 | How satisfied were you with your contribution to the team? | SATISFIED |  |
| S09 | How enjoyable was playing on your own? | ENJOY | `playingAlone` |
| S10 | How welcome did you feel when you joined the group? | WELCOME |  |
| S11 | After trying to join, how clear was whether you had a place in the match? | CLEAR |  |
| S12 | How clear was when it was your turn? | CLEAR |  |
| S13 | How easy or difficult was it to tell which [candles] were yours? | EASE |  |
| S14 | How easy or difficult was it to tell what you contributed to the team's result? | EASE |  |
| S15 | How enjoyable was watching other players play? | ENJOY |  |

## T · Motivation, continuation, and another visit

| Code | Question | Scale | In bank.ts |
|---|---|---|---|
| T01 | How interested are you in playing more right now? | INTEREST | `playMore` |
| T02 | How interested are you in coming back another day? | INTEREST | `comeBack` |
| T03 | How clear is what you could do on another visit? | CLEAR | `nextVisit` |
| T04 | How interested are you in trying [the available activity] next? | INTEREST |  |
| T05 | How interested are you in trying a different approach next time? | INTEREST |  |
| T06 | How interested are you in working toward [the longer-term goal]? | INTEREST |  |
| T07 | How interested are you in discovering more of this world? | INTEREST |  |
| T08 | How interested are you in inviting a friend to play? | INTEREST | `inviteFriend` |
| T09 | How worthwhile did this visit feel? | WORTH | `worthIt` |
| T10 | How well did this activity fit your interests? | FIT |  |

## Q · Technical experience, access, and recovery

| Code | Question | Scale | In bank.ts |
|---|---|---|---|
| Q01 | How satisfied were you with how smoothly the game ran? | SATISFIED | `smoothness` |
| Q02 | How satisfied were you with how quickly the game responded to your controls? | SATISFIED |  |
| Q03 | How satisfied were you with the loading time? | SATISFIED |  |
| Q04 | After getting stuck, how easy or difficult was it to get back to playing? | EASE | `gettingUnstuck` |
| Q05 | How comfortable was the amount of movement on screen? | COMFORT |  |
| Q06 | How easy or difficult was it to follow the game with sound off? | EASE |  |
| Q07 | How easy or difficult was it to tell the important objects apart? | EASE | `objectContrast` |
| Q08 | How comfortable were the controls on the device you used? | COMFORT |  |
| Q09 | After an interruption, how easy or difficult was it to continue? | EASE |  |
| Q10 | How easy or difficult was it to pick up where you left off on your last visit? | EASE |  |
| Q11 | How comfortable was the sound during play? | COMFORT |  |
| Q12 | How easy or difficult was it to keep the action in view? | EASE |  |
