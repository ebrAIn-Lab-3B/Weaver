# Weaver로 일 한 건을 끝까지 해 보기 (2차, 2.1판)

이 안내서는 agentic-browser 프로젝트를 Weaver에 붙이는 일부터 시작합니다. agentic-browser는 agentic-base의 일하는 방식을 따르는 프로젝트입니다. 붙이고 나면 일 한 건이 시작해서 끝나는 것까지 따라가 봅니다. 우리가 만든 도구를 우리가 직접 써 보는 일을 도그푸딩이라고 부릅니다. 설치와 첫 설정은 [1차 안내서](dogfooding-round-1.md)가 다뤘습니다. 영어로 된 같은 안내서는 [여기](dogfooding-round-2.md)에 있습니다.

따라 하다가 막히거나 불편하면 거기서 멈추고 [끝의 방법](#불편한-점-알리기)대로 알려 주세요. 막힌 곳이 바로 우리가 고쳐야 할 곳입니다.

## 시작하기 전에 알아 둘 것

- **agentic-base**는 새 프로젝트를 만들 때 통째로 복사해 쓰는 바탕입니다. **agentic-browser**는 그렇게 만든 프로젝트입니다. 복사할 때 Weaver 설정 파일(`.weaver/process.yaml`)이 아직 없었기 때문에, agentic-browser에는 이 파일이 없습니다. 이 안내서는 그 빈자리를 채웁니다.
- **process 파일**(`.weaver/process.yaml`)은 저장소가 일을 어떻게 관리하는지 적어 둔 파일입니다. 카드를 어느 열에 둘지, 일이 끝났다는 증거로 무엇을 볼지가 들어 있습니다.
- agentic-base가 이 파일을 `main`에 올렸는지 먼저 확인하세요. 지금은 [agentic-base의 풀 리퀘스트 #2](https://github.com/ebrAIn-Lab-3B/agentic-base/pull/2)에 있고 팀 검토를 기다리는 중입니다. 병합되기 전에는 아래 2번의 `ref` 줄이 필요합니다.
- 풀 리퀘스트(PR)는 고친 내용을 합쳐 달라는 요청입니다. Issue는 GitHub의 일감 항목입니다.

## 준비물

- VS Code 1.90 이상
- agentic-browser와 Project(`ebrAIn-Lab-3B` 조직의 1번)를 읽고 쓸 수 있는 GitHub 계정
- Node.js, 그리고 로그인해 둔 GitHub 명령줄 도구(`gh`)

## 1. 설치

1. [최신 릴리즈](https://github.com/ebrAIn-Lab-3B/Weaver/releases)에서 `weaver-<버전>.vsix`와 `weaver.js`를 내려받습니다.
2. VS Code의 확장 화면에서 `…`를 누르고 **VSIX에서 설치…** 를 골라 파일을 지정합니다(영어 화면에서는 *Install from VSIX…*).
3. 예전에 `palab.weaver`라는 확장을 설치했다면 먼저 지웁니다. 이름이 바뀌어서 두 개가 함께 보일 수 있습니다. 새 확장은 `ebrain-lab.weaver`입니다.
4. VS Code를 다시 불러옵니다(명령 팔레트에서 *Developer: Reload Window*). 왼쪽 막대에 **Weaver** 아이콘이 보이면 됩니다.

터미널 도구는 따로 설치하지 않습니다. 내려받은 `weaver.js`를 `node weaver.js <명령>`으로 실행합니다. 아래 예는 `weaver.js`가 있는 폴더에서 실행한다고 보고 씁니다.

## 2. 프로젝트 폴더에 설정 파일 두기

agentic-browser가 들어 있는 폴더(예: `ebr_prj`) 안에 `.weaver/config.yaml` 파일을 만듭니다. 이 폴더 아래의 모든 저장소가 이 파일을 따릅니다. 파일은 내 컴퓨터에만 있고, 어느 저장소에도 올라가지 않습니다.

```yaml
project:
  owner: ebrAIn-Lab-3B
  number: 1
repositories:
  - ebrAIn-Lab-3B/agentic-browser
guideline:
  repository: ebrAIn-Lab-3B/agentic-base
  ref: weaver-process-file
```

각 줄의 뜻은 이렇습니다.
- `project`는 카드를 보여 줄 GitHub Project입니다.
- `repositories`는 보여 줄 저장소입니다. agentic-browser에는 아직 Issue가 하나도 없어서, 이 줄에 적어야 전체 보기에 줄(레인)이 생깁니다. 이미 `repositories`가 있다면 목록을 지우지 말고 agentic-browser 한 줄만 더하세요. 목록에 없는 저장소는 전체 보기에서 사라집니다.
- `guideline`은 따를 지침이 어느 저장소의 어느 파일인지 가리킵니다. `path`를 적지 않으면 `.weaver/process.yaml`을 읽습니다.
- `ref: weaver-process-file`은 agentic-base의 PR #2가 병합되기 전에만 씁니다. 병합된 뒤에는 이 줄을 지웁니다. 그러면 `main`에서 읽습니다.

명령 팔레트의 **Weaver: 설정**으로 처음 설정했다면, 그때 만든 파일은 `~/.weaver/config.yaml`입니다. 그 파일에 같은 `guideline` 줄을 적어도 됩니다. 폴더 안의 파일이 개인 파일보다 먼저 쓰입니다.

## 3. 전체 보기에서 agentic-browser 찾기

1. Weaver 아이콘을 누르고 **전체 보기 열기**를 고릅니다. 이미 열려 있으면 **새로 고침**을 누릅니다.
2. agentic-browser 줄(레인)을 찾습니다. 이렇게 보여야 합니다.
   - 줄 제목 아래에 `지침: ebrAIn-Lab-3B/agentic-base .weaver/process.yaml@weaver-process-file (루트 파일에서)`
   - 그 아래에 `아직 process 파일이 없습니다. 이 지침으로 시작할 수 있습니다.`
   - **process 파일 시작하기** 버튼
   - 카드는 아직 없으므로 `카드 없음`
3. 터미널에서도 같은 것을 볼 수 있습니다.

   ```bash
   node weaver.js process --text
   ```

   agentic-browser 줄이 이렇게 나옵니다. 끝의 `can-start`는 시작 파일을 제안할 수 있다는 뜻입니다.

   ```text
   ebrAIn-Lab-3B/agentic-browser	missing	columns=default ...	guideline=ebrAIn-Lab-3B/agentic-base@weaver-process-file(root) can-start
   ```

줄이 보이지 않으면 2번의 파일 위치와 `repositories` 줄을 다시 확인하세요.

## 4. 시작 파일 만들기

1. agentic-browser 줄의 **process 파일 시작하기**를 누릅니다.
2. 확인 창에 만들 파일의 내용이 전부 나옵니다. 첫 줄이 이렇게 시작합니다.

   ```text
   # Started from the guideline ebrAIn-Lab-3B/agentic-base .weaver/process.yaml@weaver-process-file.
   ```

   그 아래는 agentic-base의 파일 그대로입니다. 읽어 보세요. 열을 상태 라벨 여섯 개(`status:backlog` 같은 것)로 정하고, 일이 끝났다는 증거로 합쳐진 PR을 요구하는 내용입니다.
3. 괜찮으면 **풀 리퀘스트 열기**를 누릅니다. 취소하면 아무것도 올라가지 않습니다.
4. 알림이 뜨면 **보기**를 누릅니다. agentic-browser의 PR 화면이 지금 보던 탭 바로 옆에 새 탭으로 열립니다. 브랜치 이름은 `docs/weaver-process-file`입니다.
5. 이 탭에서 PR을 읽고 합칩니다. 이 PR을 합치기 전에는 기본 브랜치를 건드리지 않습니다.

합친 뒤 전체 보기를 새로 고치면 **process 파일 시작하기** 버튼이 사라집니다. 터미널에서는 `weaver process --text`의 agentic-browser 줄이 `read`로 바뀝니다.

터미널로 같은 일을 하려면 이렇게 합니다. 먼저 계획만 보여 주고, 계획에 나온 번호를 넣어 다시 실행해야 PR이 올라갑니다.

```bash
node weaver.js process start --repository ebrAIn-Lab-3B/agentic-browser
node weaver.js process start --repository ebrAIn-Lab-3B/agentic-browser --approve <계획에 나온 번호>
```

## 5. 상태 라벨 여섯 개 만들기

방금 만든 process 파일은 카드의 열을 Issue의 라벨로 정합니다. agentic-browser에는 이 라벨이 아직 없으므로 한 번 만들어 줍니다. 안 만들면 다음 단계에서 Issue를 만들 때 라벨을 붙이지 못합니다.

PowerShell:

```powershell
foreach ($label in 'backlog','ready','in-progress','blocked','review','verified') {
  gh label create "status:$label" --repo ebrAIn-Lab-3B/agentic-browser
}
```

Git Bash:

```bash
for label in backlog ready in-progress blocked review verified; do
  gh label create "status:$label" --repo ebrAIn-Lab-3B/agentic-browser
done
```

이미 있는 라벨이면 "already exists"라고 나오는데, 그대로 두어도 됩니다.

## 6. 일감 한 건을 보드에 올리기

agentic-browser의 다음 일은 `fix_plan.md`에 있습니다. 그중 사람이 정해야 하는 일 하나를 골라 Issue로 만듭니다. 예로 `contract-final-2`(Story Chain의 Experience를 확정하는 일)를 씁니다.

agentic-base의 제안(검토 중)은 이렇습니다. 일은 `fix_plan.md`에 두고, 사람의 승인이 필요하거나 다른 사람과 함께 봐야 하는 일만 Issue로 만듭니다. 그리고 `fix_plan.md`의 그 줄 끝에 Issue 번호를 적습니다.

1. Issue를 만듭니다.

   ```bash
   gh issue create --repo ebrAIn-Lab-3B/agentic-browser --label status:backlog --title "Experience 확정 (contract-final-2)" --body "fix_plan.md의 contract-final-2. docs/contracts/story-chain/experiences/ 에 1건 이상 확정한다."
   ```

   만든 Issue의 주소가 나옵니다. 첫 Issue라면 번호는 1번입니다.
2. 그 Issue를 Project에 올립니다.

   ```bash
   node weaver.js project add https://github.com/ebrAIn-Lab-3B/agentic-browser/issues/1
   ```

   계획이 나옵니다. 괜찮으면 나온 번호를 `--approve <번호>`로 넣어 다시 실행합니다.
3. 전체 보기를 새로 고칩니다. agentic-browser 줄의 **백로그**에 새 카드가 보입니다.
4. `fix_plan.md`의 `contract-final-2` 줄 끝에 `(#1)`을 적어 둡니다. 번호가 있는 줄이 보드에 있는 일입니다.

`weaver task create`를 쓰지 않는 이유가 있습니다. 이 명령은 `REQ-번호` 요구사항 파일이 있는 저장소에서 씁니다. agentic-browser에는 그 파일이 아직 없으므로 Issue를 직접 만듭니다.

## 7. 일을 시작하고 끝내기

1. 일을 시작하면 카드를 진행 중으로 옮깁니다. 먼저 바뀔 내용을 보여 주고, 승인해야 바꿉니다.

   ```bash
   node weaver.js card move ebrAIn-Lab-3B/agentic-browser#1 --to in-progress
   ```

2. 일을 마치는 PR의 본문에 `Closes #1`을 적습니다. PR이 합쳐지면 Issue가 저절로 닫힙니다. 닫는 PR이 없으면 카드에 "이 Issue를 닫는 병합된 PR이 없습니다"라는 표시가 붙습니다.
3. 전체 보기에서 카드를 마우스 오른쪽 버튼으로 누르고 **풀 리퀘스트**를 고릅니다. PR 화면이 새 탭으로 열립니다. 로그인하라고 하면 이 탭 안에서 합니다.
4. 이 탭에서 PR을 읽고, 댓글을 달고, 합칩니다.
5. 다른 창에 갔다가 돌아오거나 1분쯤 기다리면, 화면 아래 상태 표시줄에 "풀 리퀘스트 #번호이(가) 병합됐습니다"가 뜹니다. 카드도 알아서 바뀝니다.

VS Code 안이 아니라 시스템 브라우저로 열고 싶다면, 카드 메뉴에서 **시스템 브라우저에서 Issue #번호 열기**를 고릅니다.

## 8. 마무리 점검

```bash
node weaver.js reconcile
```

처리할 것이 없다고 나오면 보드와 파일이 서로 맞는 것입니다. 무엇을 고쳐야 한다고 나오면 계획을 읽어 보고, 괜찮으면 `--approve`로 승인합니다.

**알려진 불편이 하나 있습니다.** PR이 Issue를 닫아도 `status:verified` 라벨은 저절로 붙지 않습니다. 닫힌 카드에 "닫혔지만 status:verified 라벨이 없습니다(검증 공백)"라는 경고가 뜨면, Issue에 그 라벨을 직접 붙여 주세요.

```bash
gh issue edit 1 --repo ebrAIn-Lab-3B/agentic-browser --add-label status:verified --remove-label status:in-progress
```

아직 고치지 못한 불편입니다. 겪으면 알려 주세요.

## 불편한 점 알리기

[피드백 양식](https://github.com/ebrAIn-Lab-3B/Weaver/issues/new?template=dogfooding-feedback.yml)을 엽니다. 네 가지를 묻습니다. 무엇을 하려 했는지, 어떻게 되기를 바랐는지, 실제로 어떻게 되었는지, 일하는 데 얼마나 걸림돌이었는지입니다. 화면 사진이 있으면 도움이 됩니다. 짧아도 괜찮습니다.

## 막혔을 때

| 이런 일이 생기면 | 이렇게 해 보세요 |
| --- | --- |
| 전체 보기에 agentic-browser 줄이 없음 | 2번 파일의 위치와 `repositories` 줄을 확인하고, **새로 고침**을 누릅니다. |
| 줄은 있는데 지침 줄이 안 나옴 | 2번의 `guideline` 줄을 확인합니다. `repository`는 `소유자/이름` 모양이어야 합니다. |
| "지침 파일이 그곳에 없어서 기본값을 대신 제안한다"고 나옴 | agentic-base의 `main`에 파일이 아직 없는 것입니다. 2번의 `ref: weaver-process-file` 줄을 넣었는지 확인합니다. |
| "이미 process 파일이 있다"며 시작이 거절됨 | agentic-browser에 이미 파일이 있는 것입니다. 지침은 있는 파일을 바꾸지 않습니다. 고치려면 그 파일을 PR로 고칩니다. |
| 시작 파일 PR이 "이미 열려 있다"며 거절됨 | 열려 있는 PR(`docs/weaver-process-file`)을 합치거나 닫은 뒤 다시 합니다. |
| "project" 권한이 없다고 나옴 | **GitHub에 로그인**을 다시 눌러 `project` 권한을 허락합니다. |
| 확장이 두 개 보임(`palab.weaver`와 `ebrain-lab.weaver`) | 예전 것(`palab.weaver`)을 지우고 VS Code를 다시 불러옵니다. |
| `gh issue create`가 라벨 때문에 실패함 | 5번에서 라벨을 만들었는지 확인합니다. |
| PR이 VS Code 안이 아니라 외부 브라우저로 열림 | 이 VS Code에 내장 브라우저가 없는 경우입니다. 시스템 브라우저로 열리는 것이 정상 동작입니다. |
| 카드에서 **풀 리퀘스트**를 골랐는데 "이 Issue를 가리키는 풀 리퀘스트가 없습니다"라고 나옴 | PR 본문에 `Closes #번호` 또는 `Refs #번호`가 있는지 봅니다. |

## Weaver가 하지 않는 일

Weaver는 무엇을 바꿀지 보여 주고 승인을 받기 전에는 카드, 라벨, 파일을 바꾸지 않습니다. 읽기만 하는 동안에는 아무것도 바뀌지 않습니다. 이 안내서에서 사람이 직접 하는 일은 라벨 만들기, Issue 만들기, `fix_plan.md` 고치기입니다.
