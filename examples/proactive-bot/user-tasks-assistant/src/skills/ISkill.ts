export interface ISkill {
  run(input: string): Promise<any>;
}
