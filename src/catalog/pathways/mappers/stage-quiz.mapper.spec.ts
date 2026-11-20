import {
  stageQuizReadSelect,
  toStageQuiz,
  type StageQuizReadRow,
} from './stage-quiz.mapper';

describe('stage quiz mapper', () => {
  const row: StageQuizReadRow = {
    id: 'quiz-1',
    stageId: 'stage-1',
    questions: [
      {
        id: 'q1',
        prompt: 'Which one?',
        options: [
          { id: 'q1-o0', text: 'A' },
          { id: 'q1-o1', text: 'B' },
          { id: 'q1-o2', text: 'C' },
          { id: 'q1-o3', text: 'D' },
        ],
      },
    ],
  };

  describe('stageQuizReadSelect', () => {
    it('never selects the correct option, at any depth', () => {
      expect(JSON.stringify(stageQuizReadSelect)).not.toMatch(/correct/i);
    });

    it('reads questions and options in display order', () => {
      expect(stageQuizReadSelect.questions.orderBy).toEqual({ order: 'asc' });
      expect(stageQuizReadSelect.questions.select.options.orderBy).toEqual({
        order: 'asc',
      });
    });
  });

  describe('toStageQuiz', () => {
    it('maps the quiz, its questions and their options', () => {
      expect(toStageQuiz(row)).toEqual(row);
    });

    it('drops any field the row carries beyond the response fields', () => {
      const leaky = {
        ...row,
        questions: [
          {
            ...row.questions[0],
            correctIndex: 2,
            options: row.questions[0].options.map((option) => ({
              ...option,
              order: 0,
              isCorrect: true,
            })),
          },
        ],
      } as unknown as StageQuizReadRow;

      const body = JSON.stringify(toStageQuiz(leaky));

      expect(body).not.toMatch(/correct/i);
      expect(body).not.toContain('order');
    });

    it('returns no questions for a quiz with none', () => {
      expect(toStageQuiz({ ...row, questions: [] }).questions).toEqual([]);
    });
  });
});
